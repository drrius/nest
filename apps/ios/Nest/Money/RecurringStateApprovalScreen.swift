import SwiftUI

struct RecurringStateApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: RecurringStateApprovalModel
    @State private var choice: Bool?

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: RecurringStateApprovalModel(
            session: session, member: member, approvalId: approvalId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                ruleSummary(saved.reviewedRule, title: "Rule reviewed when deciding")
                requestedChange(saved.decision.change)
                recovery(saved)
            } else if let approval = model.proposal, let rule = model.rule {
                ruleSummary(rule, title: "Current recurring expense")
                requestedChange(approval.change)
                review(approval, rule: rule)
            }
            if let notice = model.notice { Section { Text(notice) } }
            Button("Refresh proposal") { Task { await model.load() } }
        }
        .disabled(model.working)
        .navigationTitle("Review rule change")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .confirmationDialog(
            choice == true ? "Apply this rule change?" : "Decline this rule change?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Confirm rule change" : "Decline", role: .destructive) {
                    Task { await model.decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact rule and revision you reviewed. Existing financial history remains.")
        }
    }

    private func ruleSummary(_ rule: RecurringRule, title: String) -> some View {
        Section(title) {
            Text(rule.configuration.description).font(.headline)
            LabeledContent("Status", value: rule.status.rawValue.capitalized)
            LabeledContent("Payer", value: rule.configuration.payerId == member.userId ? "You" : "Your partner")
            if let amount = rule.configuration.amountCentimes {
                LabeledContent("Amount per cycle", value: amount.absoluteCHF)
            } else {
                Text("Variable amount · each cycle needs confirmation")
            }
            if let allocations = rule.configuration.allocations {
                ForEach(allocations, id: \.memberId) {
                    LabeledContent(
                        $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
                }
            }
            if rule.configuration.schedule.kind == .monthly {
                LabeledContent("Cadence", value: "Monthly on day \(rule.configuration.schedule.dayOfMonth ?? 1)")
            } else {
                let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                LabeledContent("Cadence", value: "Weekly on \(days[(rule.configuration.schedule.weekday ?? 1) - 1])")
            }
            LabeledContent("Starts", value: rule.configuration.startDate.value)
            if let due = rule.nextDueOn { LabeledContent("Next due", value: due.value) }
            NavigationLink("View current rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: rule.id).id(session.generation)
            }
        }
    }

    private func requestedChange(_ change: RecurringStateInput) -> some View {
        Section("Proposed change") {
            Text(change.action == .pause ? "Pause future recording" : "Permanently cancel this rule").font(.headline)
            Text(change.action == .pause
                ? "Resuming requires a separate decision."
                : "A cancelled rule cannot be edited or resumed.")
            Text("Existing entries stay in your history. An entry recorded before this change is not reversed.")
            Text("This does not cancel a bank payment, subscription or service with its provider.")
        }
    }

    @ViewBuilder
    private func review(_ approval: RecurringStateApproval, rule: RecurringRule) -> some View {
        Section {
            if let receipt = approval.receipt {
                Text("Rule \(receipt.status.rawValue). No expense was recorded by this decision.")
            } else if approval.status == .denied {
                Text("Proposal declined. This decision did not change the rule.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(approval.expiresAt, now: clock.date), approval.status == .pending {
                        if approval.change.matches(rule) {
                            Button("Review confirmation", role: .destructive) { choice = true }
                        } else {
                            Text("The rule changed. Decline this proposal and request a new one.")
                        }
                        Button("Decline proposal", role: .destructive) { choice = false }
                    } else {
                        Text("This proposal is expired or awaiting its recorded result. Refresh to check again.")
                    }
                }
            }
        }
    }

    private func recovery(_ saved: SavedRecurringStateDecision) -> some View {
        Section("Saved decision") {
            Text(saved.decision.approved ? "You chose to confirm this change." : "You chose to decline this change.")
            if saved.expiry?.expiredUnused == true {
                Text("This proposal expired without applying its change. Ask for a new proposal if still needed.")
            } else if let receipt = saved.result?.approval.receipt {
                Text("Rule \(receipt.status.rawValue). No expense was recorded by this decision.")
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. This decision did not change the rule.")
            } else {
                Text("Not confirmed yet. Resolve this exact decision before reviewing another rule change.")
                Button("Check and retry") { Task { await model.retry() } }
            }
            if saved.isTerminal {
                Button("Done") { Task { if await model.finish() { dismiss() } } }
            }
        }
    }
}
