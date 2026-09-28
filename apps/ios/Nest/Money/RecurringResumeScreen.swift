import SwiftUI

struct RecurringResumeScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID
    @State private var context: ExpenseContext?
    @State private var detail: RecurringDetail?
    @State private var saved: SavedRecurringResume?
    @State private var reviewed: RecurringResumeInput?
    @State private var resumeFrom = ""
    @State private var working = false
    @State private var notice: String?
    @State private var confirmCancel = false

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.command.change)
                recovery(saved)
            } else if let reviewed {
                summary(reviewed)
                Section {
                    Button("Confirm resume") { Task { await save() } }
                    Button("Edit") { self.reviewed = nil }
                }
            } else if let detail, detail.rule.status == .paused {
                Section {
                    Text(detail.rule.configuration.description).font(.headline)
                    Text(
                        detail.rule.configuration.mode == .fixed
                            ? "Resuming restarts automatic expense recording. Nest does not move money."
                            : "Resuming restarts bill reminders. Each amount and split still needs confirmation.")
                    if let amount = detail.rule.configuration.amountCentimes { Text(amount.absoluteCHF) }
                    Text("Resume from (YYYY-MM-DD)").font(.caption)
                    TextField("Resume date", text: $resumeFrom).textInputAutocapitalization(.never)
                    Button("Review resume") { review(detail) }
                }
            } else if detail != nil {
                Section { Text("Only paused rules can be resumed.") }
            }
            if working { ProgressView("Checking rule…") }
            if saved == nil && reviewed == nil {
                Button("Refresh rule") { Task { await load() } }
            }
        }
        .disabled(working)
        .navigationTitle("Resume rule")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .confirmationDialog("Cancel this pending resume?", isPresented: $confirmCancel) {
            Button("Cancel pending resume", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("An already completed resume will be recovered. You can then pause the rule again.")
        }
    }

    private func summary(_ input: RecurringResumeInput) -> some View {
        Section("Review resume") {
            NavigationLink("View affected rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: input.ruleId)
            }
            if let rule = detail?.rule, rule.id == input.ruleId {
                Text(rule.configuration.description).font(.headline)
                LabeledContent("Payer", value: rule.configuration.payerId == member.userId ? "You" : "Your partner")
                if let amount = rule.configuration.amountCentimes { Text(amount.absoluteCHF) }
                if let allocations = rule.configuration.allocations {
                    ForEach(allocations, id: \.memberId) {
                        LabeledContent(
                            $0.memberId == member.userId ? "Your share" : "Partner’s share",
                            value: $0.centimes.absoluteCHF)
                    }
                }
                Text(rule.configuration.mode == .fixed ? "Automatic expense recording" : "Confirm each bill")
            }
            LabeledContent("Resume from", value: input.resumeFrom.value)
            LabeledContent("First due", value: input.firstDueOn.value)
            Text("The rule resumes with its existing amount, split and schedule. Skipped cycles are not backfilled.")
                .font(.footnote)
        }
    }
    private func recovery(_ saved: SavedRecurringResume) -> some View {
        Section("Resume status") {
            if saved.result?.receipt != nil {
                Text("Rule resumed.")
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("Resume request cancelled.")
                Button("Continue") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this request before resuming another rule.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested { Button("Cancel pending resume") { confirmCancel = true } }
            }
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRecurringResume(current)
            if saved == nil { try await reload(current) }
        }
    }
    private func reload(_ context: ExpenseContext) async throws {
        detail = nil
        let result = try await session.readRecurringRule(context, ruleId: ruleId)
        detail = result
        resumeFrom = max(result.today.value, result.rule.configuration.startDate.value)
    }
    private func review(_ detail: RecurringDetail) {
        do {
            let from = try CivilDate(resumeFrom)
            guard detail.rule.status == .paused, from.value >= detail.today.value,
                from.value >= detail.rule.configuration.startDate.value,
                let due = try RecurringDates.firstUncovered(
                    schedule: detail.rule.configuration.schedule,
                    from: from, coveredThrough: detail.rule.coveredThrough)
            else { throw NestAPIFailure.invalid }
            reviewed = .init(
                ruleId: ruleId, expectedRevision: detail.rule.revision, expectedStatus: "paused",
                action: "resume", resumeFrom: from, firstDueOn: due)
            notice = nil
        } catch { notice = "Choose a valid date from today onward with an available future cycle." }
    }
    private func save() async {
        guard let context, let reviewed else { return }
        await perform {
            try await session.stageRecurringResume(reviewed, context: context)
            saved = try await session.savedRecurringResume(context)
            self.reviewed = nil
            saved = try await session.retryRecurringResume(context)
        }
    }
    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelRecurringResume(context) : session.retryRecurringResume(context))
        }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRecurringResume(context, operation: saved.command.operationId)
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
            if let context { saved = try? await session.savedRecurringResume(context) }
            notice = "Could not confirm the resume. Resolve any saved request, then refresh the rule."
        }
    }
}
