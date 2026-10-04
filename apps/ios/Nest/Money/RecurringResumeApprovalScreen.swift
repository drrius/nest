import SwiftUI

struct RecurringResumeApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: RecurringResumeApprovalModel
    @State private var choice: Bool?

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: RecurringResumeApprovalModel(
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
                    session: session, member: member, rule: rule,
                    title: approval.receipt == nil ? "Current recurring expense" : "Terms when resumed",
                    recordedResume: approval.receipt)
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
        .navigationTitle("Review resumption")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .alert(
            choice == true ? "Resume this recurring expense?" : "Decline this resumption?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Confirm resumption" : "Decline") {
                    Task { await model.decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text(
                "This authorizes future recording using the exact amount, payer, split and dates reviewed. Skipped cycles and existing history stay unchanged."
            )
        }
    }

    private func requestedChange(_ change: RecurringResumeInput) -> some View {
        Section("Proposed resumption") {
            LabeledContent("Resume from", value: change.resumeFrom.value)
            LabeledContent("First new cycle", value: change.firstDueOn.value)
            Text(
                "Retain the amount, payer and split shown above. Fixed expenses resume automatic recording; variable expenses still need confirmation for each cycle."
            )
            Text("Skipped cycles are not backfilled. This does not make a bank payment or reverse existing history.")
        }
    }

    @ViewBuilder
    private func review(_ approval: RecurringResumeApproval, rule: RecurringRule) -> some View {
        Section {
            if let receipt = approval.receipt {
                Text(
                    "Rule resumed. First new cycle: \(receipt.change.firstDueOn.value). No expense was recorded by this decision."
                )
            } else if approval.status == .denied {
                Text("Proposal declined. This decision did not change the rule.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(approval.expiresAt, now: clock.date), approval.status == .pending {
                        if model.today.map({ approval.change.matches(rule, today: $0) }) == true,
                            approval.change.resumeFrom.value >= approval.reviewedOn.value,
                            (try? TodayMoment(now: clock.date, timeZone: TimeZone(identifier: "Europe/Zurich")!))
                                .map({ approval.change.resumeFrom.value >= $0.day.value }) == true
                        {
                            Button {
                                choice = true
                            } label: {
                                QuietActionLabel("Review confirmation")
                            }
                        } else {
                            Text("The rule or available dates changed. Decline this proposal and request a new one.")
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

    private func recovery(_ saved: SavedRecurringResumeDecision) -> some View {
        Section("Saved decision") {
            Text(saved.decision.approved ? "You chose to confirm this change." : "You chose to decline this change.")
            if saved.datePassedUnused {
                Text("The resumption date passed without applying this change. Ask for a new proposal if still needed.")
            } else if saved.expiry?.expiredUnused == true {
                Text("This proposal expired without applying its change. Ask for a new proposal if still needed.")
            } else if let receipt = saved.result?.approval.receipt {
                Text(
                    "Rule resumed. First new cycle: \(receipt.change.firstDueOn.value). No expense was recorded by this decision."
                )
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
