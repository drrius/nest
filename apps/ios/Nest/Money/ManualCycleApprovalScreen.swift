import SwiftUI

struct ManualCycleApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: ManualCycleApprovalModel
    @State private var choice: Bool?

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: ManualCycleApprovalModel(session: session, member: member, approvalId: approvalId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                summary(saved.decision.input, context: saved.reviewedContext, receipt: saved.result?.approval.receipt)
                recovery(saved)
            } else if let approval = model.proposal, let context = model.proposalContext {
                summary(approval.input, context: context, receipt: approval.receipt)
                review(approval, context: context)
            }
            if let notice = model.notice { Section { Text(notice) } }
            Button {
                Task { await model.load() }
            } label: {
                QuietActionLabel("Refresh proposal")
            }
        }
        .disabled(model.working)
        .navigationTitle("Review expense link")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .alert(
            choice == true ? "Link expense?" : "Decline link?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Link" : "Decline", role: choice ? nil : .destructive) {
                    Task { await model.decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text("No new expense or payment.")
        }
    }

    @ViewBuilder private func summary(
        _ input: ManualCycleInput, context: ManualCycleContext, receipt: ManualCycleReceipt?
    ) -> some View {
        if let receipt {
            ManualCycleSummary(
                member: member, input: input, configuration: receipt.configuration,
                cycle: receipt.cycle, source: receipt.linkedExpense)
        } else if context.matches, let cycle = context.target.manualCycle {
            ManualCycleSummary(
                member: member, input: input, configuration: context.target.rule.configuration,
                cycle: cycle, source: context.detail)
        } else {
            Section("Original proposal") {
                QuietValueRow("Due date", value: input.dueOn.value)
                Text("The current expense or bill no longer matches this proposal. Request a new review.")
                Text("A changed rule’s current terms are not part of this original proposal.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
                NavigationLink {
                    MoneyDetailScreen(session: session, member: member, eventId: input.sourceEventId)
                } label: {
                    QuietActionLabel("View selected expense as it is now")
                }
            }
        }
    }

    private func review(_ approval: ManualCycleApproval, context: ManualCycleContext) -> some View {
        Section {
            if let receipt = approval.receipt {
                recorded(receipt)
            } else if approval.status == .denied {
                Text("Proposal declined. No cycle was linked by this decision.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(approval.expiresAt, now: clock.date), approval.status == .pending {
                        if context.matches {
                            Button {
                                choice = true
                            } label: {
                                QuietActionLabel("Review confirmation")
                            }
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

    private func recorded(_ receipt: ManualCycleReceipt) -> some View {
        VStack(alignment: .leading) {
            Text("Existing expense linked. This cycle is covered; no new expense or balance change was created.")
            NavigationLink {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            } label: {
                QuietActionLabel("View linked expense")
            }
        }
    }

    private func recovery(_ saved: SavedManualCycleDecision) -> some View {
        Section("Saved decision") {
            Text(saved.decision.approved ? "You chose to link this expense." : "You chose to decline this link.")
            if saved.expiry?.expiredUnused == true {
                Text("The proposal expired without linking its expense. Ask for a new proposal if still needed.")
            } else if saved.conflict != nil {
                Text("This decision did not link the expense: its bill, cycle or expense changed.")
                Text("Finish this check, then decline the old proposal or request a new one.")
            } else if let receipt = saved.result?.approval.receipt {
                recorded(receipt)
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. No cycle was linked by this decision.")
            } else {
                Text("Not confirmed yet. Resolve this exact decision before reviewing another link proposal.")
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
