import SwiftUI

struct VariableCycleScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID
    @State private var context: ExpenseContext?
    @State private var detail: RecurringDetail?
    @State private var members: [MoneyBalance.Member] = []
    @State private var draft = VariableCycleDraft()
    @State private var reviewed: VariableCycleInput?
    @State private var saved: SavedVariableCycle?
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false
    @FocusState private var focusedField: String?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.command.input, receipt: saved.result?.receipt)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button("Record bill") { Task { await save() } }
                    Button("Edit amount and split") { self.reviewed = nil }
                    Button("Reload bill and edit") {
                        self.reviewed = nil
                        Task { await load() }
                    }
                }
            } else if let detail, detail.rule.isDue(on: detail.today) {
                fields(detail)
            } else if detail != nil {
                Section { Text("No bill is due for confirmation on this rule.") }
            }
            if saved == nil && reviewed == nil {
                Button("Refresh bill") { Task { await load() } }
            }
        }
        .id(saved != nil ? "saved" : reviewed != nil ? "review" : "draft")
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .navigationTitle("Confirm bill")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .scrollDismissesKeyboard(.interactively)
        .modifier(
            MoneyDraftKeyboard(
                focus: $focusedField, review: keyboardReview,
                reviewLabel: "Review bill", reviewIdentifier: "variable-bill.keyboard-review")
        )
        .task { await load() }
        .confirmationDialog("Cancel this pending bill entry?", isPresented: $confirmCancel) {
            Button("Cancel pending entry", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("If the bill was already recorded, its result will be recovered and remain in financial history.")
        }
    }

    private func fields(_ detail: RecurringDetail) -> some View {
        Section(detail.rule.configuration.description) {
            Text("Confirm this bill’s amount and each person’s share. Nest records the expense; it does not pay it.")
                .foregroundStyle(QuietPalette.muted)
            MoneyDraftField(
                label: "Amount (CHF)", text: $draft.amount, focus: $focusedField, keyboard: .decimalPad)
            ForEach(members) { person in
                MoneyDraftField(
                    label: person.id == member.userId ? "Your share (CHF)" : "Partner’s share (CHF)",
                    text: Binding(
                        get: { draft.shares[person.id] ?? "" }, set: { draft.shares[person.id] = $0 }),
                    focus: $focusedField, keyboard: .decimalPad, focusKey: person.id.uuidString
                )
            }
            Button("Review bill") { reviewDraft() }
        }
    }

    private var keyboardReview: (() -> Void)? {
        guard saved == nil, reviewed == nil, !working, let detail, detail.rule.isDue(on: detail.today) else {
            return nil
        }
        return { reviewDraft() }
    }

    private func reviewDraft() {
        guard let detail else { return }
        focusedField = nil
        do {
            reviewed = try draft.reviewed(detail: detail, member: member, members: members.map(\.id))
            notice = nil
        } catch { notice = "Enter a valid CHF amount and two shares that add up exactly to it." }
    }

    private func summary(_ input: VariableCycleInput, receipt: VariableCycleReceipt? = nil) -> some View {
        Section(receipt == nil ? "Bill to record" : "Recorded bill") {
            if let config = receipt?.configuration
                ?? (detail?.rule.id == input.ruleId ? detail?.rule.configuration : nil)
            {
                Text(config.description).font(.headline)
                LabeledContent("Paid by", value: name(config.payerId))
                if let note = config.note { Text(note) }
            }
            NavigationLink("View bill rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: input.ruleId)
            }
            LabeledContent("Due date", value: input.dueOn.value)
            LabeledContent("Amount", value: input.amountCentimes.absoluteCHF)
            ForEach(input.allocations, id: \.memberId) {
                LabeledContent(name($0.memberId), value: $0.centimes.absoluteCHF)
            }
        }
    }

    private func recovery(_ saved: SavedVariableCycle) -> some View {
        Section {
            if let receipt = saved.result?.receipt {
                Text("Bill recorded.")
                NavigationLink("View recorded expense") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
                }
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("Pending entry cancelled.")
                Button("Continue") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this saved entry before confirming another bill.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested {
                    Button("Cancel pending entry") { confirmCancel = true }
                }
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
            saved = try await session.savedVariableCycle(current)
            detail = nil
            reviewed = nil
            if saved == nil {
                members = try await session.readMoneyBalance(member: member, generation: current.generation).members
                detail = try await session.readRecurringRule(current, ruleId: ruleId)
            }
        }
    }
    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageVariableCycle(reviewed, context: context)
            saved = try await session.savedVariableCycle(context)
            self.reviewed = nil
            saved = try await session.retryVariableCycle(context)
        }
    }
    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelVariableCycle(context) : session.retryVariableCycle(context))
        }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishVariableCycle(context, operation: saved.command.operationId)
            self.saved = nil
            detail = nil
            draft = VariableCycleDraft()
            members = try await session.readMoneyBalance(member: member, generation: context.generation).members
            detail = try await session.readRecurringRule(context, ruleId: ruleId)
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
            if let context { saved = try? await session.savedVariableCycle(context) }
            notice =
                saved == nil
                ? "Could not start this bill entry. Connect and reload the bill before reviewing again. Your draft is kept."
                : "Could not confirm this bill. Resolve any saved entry, then refresh for the latest rule."
        }
    }
}
