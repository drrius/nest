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
        _model = StateObject(
            wrappedValue: RecurringStateApprovalModel(
                session: session, member: member, approvalId: approvalId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                RecurringApprovalRuleSummary(
                    session: session, member: member, rule: saved.reviewedRule, title: "Rule reviewed when deciding")
                requestedChange(saved.decision.change)
                recovery(saved)
            } else if let approval = model.proposal, let rule = model.rule {
                RecurringApprovalRuleSummary(
                    session: session, member: member, rule: rule, title: "Current recurring expense")
                requestedChange(approval.change)
                review(approval, rule: rule)
            }
            if let notice = model.notice { Section { Text(notice) } }
            Button {
                Task { await model.load() }
            } label: {
                QuietActionLabel("Refresh proposal")
            }
        }
        .disabled(model.working)
        .navigationTitle("Review rule change")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .alert(
            choice == true ? "Confirm change?" : "Decline change?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Confirm" : "Decline", role: .destructive) {
                    Task { await model.decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text("History stays.")
        }
    }

    private func requestedChange(_ change: RecurringStateInput) -> some View {
        Section("Proposed change") {
            Text(change.action == .pause ? "Pause future recording" : "Permanently cancel this rule").font(.headline)
            Text(
                change.action == .pause
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
                            Button(role: .destructive) {
                                choice = true
                            } label: {
                                QuietActionLabel("Review confirmation")
                            }
                        } else {
                            Text("The rule changed. Decline this proposal and request a new one.")
                        }
                        Button(role: .destructive) {
                            choice = false
                        } label: {
                            QuietActionLabel("Decline proposal")
                        }
                    } else {
                        Text("This proposal is expired or awaiting its recorded result. Refresh to check again.")
                    }
                }.buttonStyle(.borderless)
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
                Button {
                    Task { await model.retry() }
                } label: {
                    QuietActionLabel("Check and retry")
                }
            }
            if saved.isTerminal {
                Button {
                    Task { if await model.finish() { dismiss() } }
                } label: {
                    QuietActionLabel("Done")
                }
            }
        }
    }
}
