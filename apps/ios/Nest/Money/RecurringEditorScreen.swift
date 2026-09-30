import SwiftUI

struct RecurringEditorScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID?
    @State private var context: ExpenseContext?
    @State private var draft: RecurringDraft?
    @State private var members: [MoneyBalance.Member] = []
    @State private var categoryName: String?
    @State private var today: CivilDate?
    @State private var reviewed: RecurringInput?
    @State private var saved: SavedRecurring?
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false
    @FocusState private var focusedField: String?

    var body: some View {
        Form {
            if let notice, !editingDraft { Section { Text(notice) } }
            if let saved {
                summary(saved.command.rule)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button(reviewed.configuration.mode == .fixed ? "Save automatic rule" : "Save bill reminders") {
                        Task { await save() }
                    }
                    Button("Edit") { self.reviewed = nil }
                }
            } else if let draft {
                RecurringEditorFields(
                    draft: Binding(get: { self.draft ?? draft }, set: { self.draft = $0 }), members: members,
                    focus: $focusedField)
                Section {
                    NavigationLink(
                        categoryName ?? (draft.categoryId == nil ? "Choose category (optional)" : "Change category")
                    ) {
                        ExpenseCategoryPicker(
                            session: session, member: member,
                            selection: Binding(get: { self.draft?.categoryId }, set: { self.draft?.categoryId = $0 }),
                            selectedName: $categoryName)
                    }
                }
                Section {
                    if let notice { Text(notice).font(.subheadline).foregroundStyle(QuietPalette.ink) }
                    Button("Review rule") { review() }
                }
            } else {
                Button("Load rule details") { Task { await load() } }
            }
            if working { ProgressView("Checking rule…") }
        }
        .disabled(working)
        .navigationTitle(ruleId == nil ? "New recurring expense" : "Edit recurring expense")
        .modifier(MoneyDraftKeyboard(focus: $focusedField))
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .confirmationDialog("Cancel the pending save?", isPresented: $confirmCancel) {
            Button("Cancel pending save", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("If already saved, the recorded result is recovered.")
        }
    }
    private var editingDraft: Bool { draft != nil && saved == nil && reviewed == nil }
    private func summary(_ input: RecurringInput) -> some View {
        Section("Review rule") {
            Text(input.configuration.description).font(.headline)
            Text(
                input.configuration.mode == .fixed
                    ? "Automatically recorded each cycle" : "Confirm amount and split each cycle")
            LabeledContent("Payer", value: name(input.configuration.payerId))
            if let amount = input.configuration.amountCentimes { Text(amount.absoluteCHF) }
            if let allocations = input.configuration.allocations {
                ForEach(allocations, id: \.memberId) {
                    LabeledContent(name($0.memberId), value: $0.centimes.absoluteCHF)
                }
            }
            Text(
                input.configuration.schedule.kind == .monthly
                    ? "Monthly, day \(input.configuration.schedule.dayOfMonth ?? 1)"
                    : "Weekly, weekday \(input.configuration.schedule.weekday ?? 1) (Monday = 1)")
            LabeledContent("Starts", value: input.configuration.startDate.value)
            LabeledContent("First due", value: input.firstDueOn.value)
            if input.configuration.categoryId != nil {
                LabeledContent("Category", value: categoryName ?? "Previously selected category")
            }
            if let note = input.configuration.note { Text(note) }
            Text("Existing history stays unchanged. Saving does not move money.").font(.footnote)
        }
    }
    private func recovery(_ saved: SavedRecurring) -> some View {
        Section("Save status") {
            if let receipt = saved.result?.receipt {
                Text("Rule saved · \(receipt.status.rawValue).")
                NavigationLink("View saved rule") {
                    RecurringRuleScreen(session: session, member: member, ruleId: receipt.rule.ruleId)
                }
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("Pending save cancelled.")
                Button("Start again") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this saved request before saving another rule.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending save") { confirmCancel = true } }
            }
        }
    }
    private func name(_ id: UUID) -> String {
        members.first(where: { $0.id == id })?.displayName ?? (id == member.userId ? "You" : "Your partner")
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRecurring(current)
            if saved == nil { try await reload(current) }
        }
    }
    private func reload(_ current: ExpenseContext) async throws {
        draft = nil
        categoryName = nil
        members = try await session.readMoneyBalance(member: member, generation: current.generation).members
        var existing: RecurringRule?
        let date: CivilDate
        if let ruleId {
            let detail = try await session.readRecurringRule(current, ruleId: ruleId)
            guard detail.rule.status != .cancelled else { throw NestAPIFailure.conflict }
            existing = detail.rule
            date = detail.today
        } else {
            date = try await session.readRecurringRules(current, after: nil, dueOnly: false).today
        }
        today = date
        draft = RecurringDraft(member: member, today: date, existing: existing)
    }
    private func review() {
        focusedField = nil
        do {
            guard let draft, let today else { throw NestAPIFailure.invalid }
            reviewed = try draft.reviewed(member: member, members: members.map(\.id), today: today)
            notice = nil
        } catch { notice = "Check the date, schedule and amounts. Fixed shares must add up to the total." }
    }
    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageRecurring(reviewed, context: context)
            saved = try await session.savedRecurring(context)
            self.reviewed = nil
            saved = try await session.retryRecurring(context)
        }
    }
    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelRecurring(context) : session.retryRecurring(context))
        }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRecurring(context, operation: saved.command.operationId)
            self.saved = nil
            reviewed = nil
            try await reload(context)
        }
    }
    private func perform(_ work: () async throws -> Void) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            try await work()
            notice = nil
        } catch {
            if let context { saved = try? await session.savedRecurring(context) }
            notice = "Could not confirm this action. Resolve any saved request, then reload the latest rule."
        }
    }
}
