import SwiftUI

struct RecurringApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let approvalId: UUID
    @State private var context: ExpenseContext?
    @State private var envelope: RecurringApprovalEnvelope?
    @State private var categoryLabels: [UUID: String] = [:]
    @State private var currentRule: RecurringRule?
    @State private var saved: SavedRecurringDecision?
    @State private var working = false
    @State private var notice: String?
    @State private var choice: Bool?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.decision.rule)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this rule." : "You chose to decline this rule.")
                    if let result = saved.result, [.consumed, .denied].contains(result.approval.status) {
                        outcome(result.approval)
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text("Not confirmed yet. Check the saved decision before reviewing another rule.")
                        Button("Check and retry") { Task { await retry() } }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.rule)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the schedule, amount and shares above are correct.")
                                Button("Approve rule") { choice = true }.disabled(!matchesCurrent(approval.rule))
                                Button("Decline rule", role: .destructive) { choice = false }
                            } else {
                                Text("This approval has expired. Ask for a new proposal.")
                            }
                        }
                    } else {
                        outcome(approval)
                    }
                }
            }
            Button("Refresh approval") { Task { await load() } }
        }
        .disabled(working)
        .navigationTitle("Review rule")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .confirmationDialog(
            choice == true ? "Save this rule?" : "Decline this rule?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Approve and save" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact rule you reviewed. Nest does not transfer money.")
        }
    }

    @ViewBuilder
    private func summary(_ rule: RecurringInput) -> some View {
        if let currentRule, currentRule.id == rule.ruleId {
            currentSummary(currentRule, proposal: rule)
        }
        Section("Rule to save") {
            Text(rule.configuration.description).font(.headline)
            LabeledContent("Category", value: categoryLabel(rule.configuration.categoryId))
            LabeledContent("Change", value: rule.expectedRevision == nil ? "Create rule" : "Update rule")
            LabeledContent("Payer", value: rule.configuration.payerId == member.userId ? "You" : "Your partner")
            LabeledContent("Starts", value: rule.configuration.startDate.value)
            LabeledContent("First due", value: rule.firstDueOn.value)
            Text(schedule(rule.configuration.schedule))
            Text(
                rule.configuration.mode == .fixed
                    ? "Fixed amount and shares each cycle. Nest does not transfer money."
                    : "Each cycle needs its amount and shares confirmed separately.")
            if let amount = rule.configuration.amountCentimes {
                LabeledContent("Amount", value: amount.absoluteCHF)
            }
            ForEach(rule.configuration.allocations ?? [], id: \.memberId) {
                LabeledContent(
                    $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
            }
            if let note = rule.configuration.note { Text(note) }
            if rule.expectedRevision != nil {
                NavigationLink("View current rule") {
                    RecurringRuleScreen(session: session, member: member, ruleId: rule.ruleId)
                }
            }
        }
    }

    private func currentSummary(_ currentRule: RecurringRule, proposal rule: RecurringInput) -> some View {
        Section("Current rule") {
            Text(currentRule.configuration.description).font(.headline)
            LabeledContent("Category", value: categoryLabel(currentRule.configuration.categoryId))
            Text(currentRule.status.rawValue.capitalized)
            Text(schedule(currentRule.configuration.schedule))
            LabeledContent("Payer", value: currentRule.configuration.payerId == member.userId ? "You" : "Your partner")
            LabeledContent("Starts", value: currentRule.configuration.startDate.value)
            LabeledContent(
                "Mode", value: currentRule.configuration.mode == .fixed ? "Fixed amount" : "Confirm each bill")
            if let due = currentRule.nextDueOn { LabeledContent("Next due", value: due.value) }
            if let covered = currentRule.coveredThrough { LabeledContent("Covered through", value: covered.value) }
            ForEach(currentRule.configuration.allocations ?? [], id: \.memberId) {
                LabeledContent(
                    $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
            }
            if let note = currentRule.configuration.note { Text(note) }
            if let amount = currentRule.configuration.amountCentimes {
                LabeledContent("Amount", value: amount.absoluteCHF)
            }
            if !matchesCurrent(rule) {
                Text("This rule changed after the proposal. Ask for an updated proposal before approving.")
            }
        }
    }

    private func schedule(_ value: RecurringSchedule) -> String {
        if value.kind == .monthly { return "Monthly on day \(value.dayOfMonth ?? 1)" }
        let names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return "Every \(names[(value.weekday ?? 1) - 1])"
    }

    @ViewBuilder
    private func outcome(_ approval: RecurringApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Rule saved.")
            NavigationLink("View recorded rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: receipt.rule.ruleId)
            }
        } else if approval.status == .denied {
            Text("Rule declined. No rule was recorded by this approval.")
        } else {
            Text("This approval is awaiting its recorded result. Refresh to check again.")
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRecurringDecision(current)
            envelope = nil
            currentRule = nil
            categoryLabels = [:]
            if saved == nil {
                let proposal = try await session.readRecurringApproval(current, approvalId: approvalId)
                if proposal.approval.rule.expectedRevision != nil {
                    currentRule = try await session.readRecurringRule(current, ruleId: proposal.approval.rule.ruleId)
                        .rule
                }
                try await loadCategoryLabels(
                    current,
                    ids: [
                        proposal.approval.rule.configuration.categoryId, currentRule?.configuration.categoryId,
                    ])
                envelope = proposal
            }
        }
    }
    private func categoryLabel(_ id: UUID?) -> String {
        guard let id else { return "Uncategorized" }
        return categoryLabels[id] ?? "Category not loaded"
    }

    private func loadCategoryLabels(_ context: ExpenseContext, ids: [UUID?]) async throws {
        for id in Set(ids.compactMap { $0 }) {
            let result = try await session.readMoneyCategory(context, categoryId: id)
            categoryLabels[id] =
                result.category.map { $0.name + ($0.archived ? " (archived)" : "") }
                ?? "Category no longer available"
        }
    }

    private func matchesCurrent(_ rule: RecurringInput) -> Bool {
        guard let revision = rule.expectedRevision else { return true }
        return currentRule?.id == rule.ruleId && currentRule?.revision == revision
    }

    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now), !approved || matchesCurrent(approval.rule)
        else { return }
        await perform {
            try await session.stageRecurringDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    rule: approval.rule, approved: approved), context: context)
            saved = try await session.savedRecurringDecision(context)
            saved = try await session.retryRecurringDecision(context)
        }
    }
    private func retry() async {
        guard let context else { return }
        await perform { saved = try await session.retryRecurringDecision(context) }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRecurringDecision(context, approvalId: saved.decision.approvalId)
            self.saved = nil
            dismiss()
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
            if let context { saved = try? await session.savedRecurringDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
