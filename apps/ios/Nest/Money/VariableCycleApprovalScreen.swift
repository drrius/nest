import SwiftUI

struct VariableCycleApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: VariableCycleApprovalModel
    @State private var choice: Bool?

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: VariableCycleApprovalModel(session: session, member: member, approvalId: approvalId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                summary(saved.decision.input, detail: saved.reviewedDetail, receipt: saved.result?.approval.receipt)
                recovery(saved)
            } else if let approval = model.proposal, let detail = model.detail {
                summary(approval.input, detail: detail, receipt: approval.receipt)
                review(approval, detail: detail)
            }
            if let notice = model.notice { Section { Text(notice) } }
            Button {
                Task { await model.load() }
            } label: {
                QuietActionLabel("Refresh proposal")
            }
        }
        .disabled(model.working)
        .navigationTitle("Review bill")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.load() } }
        }
        .confirmationDialog(
            choice == true ? "Record this bill?" : "Decline this proposal?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Record bill" : "Decline", role: choice ? nil : .destructive) {
                    Task { await model.decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact amount, split and cycle you reviewed. Nest does not move money.")
        }
    }

    private func summary(_ input: VariableCycleInput, detail: RecurringDetail, receipt: VariableCycleReceipt?)
        -> some View
    {
        VariableCycleApprovalSummary(
            member: member, input: input,
            configuration: receipt?.configuration
                ?? (input.expectedRevision == detail.rule.revision ? detail.rule.configuration : nil),
            recordedCycle: receipt?.cycle)
    }

    private func review(_ approval: VariableCycleApproval, detail: RecurringDetail) -> some View {
        Section {
            if let receipt = approval.receipt {
                recorded(receipt)
            } else if approval.status == .denied {
                Text("Proposal declined. No expense was recorded by this decision.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(approval.expiresAt, now: clock.date), approval.status == .pending {
                        if approval.input.matches(detail) {
                            Button {
                                choice = true
                            } label: {
                                QuietActionLabel("Review confirmation")
                            }
                        } else {
                            Text("The bill changed or its cycle is covered. Decline and request a new proposal.")
                        }
                        Button(role: .destructive) {
                            choice = false
                        } label: {
                            QuietActionLabel("Decline proposal")
                        }
                    } else {
                        Text("This proposal is expired or awaiting its recorded result. Refresh to check again.")
                    }
                }
            }
        }
    }

    private func recorded(_ receipt: VariableCycleReceipt) -> some View {
        VStack(alignment: .leading) {
            Text("Bill recorded. This cycle will not be recorded again by this decision.")
            NavigationLink {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            } label: {
                QuietActionLabel("View recorded expense")
            }
        }
    }

    private func recovery(_ saved: SavedVariableCycleDecision) -> some View {
        Section("Saved decision") {
            Text(saved.decision.approved ? "You chose to record this bill." : "You chose to decline this bill.")
            if saved.expiry?.expiredUnused == true {
                Text("The proposal expired without recording its bill. Ask for a new proposal if still needed.")
            } else if saved.conflict != nil {
                Text("This saved decision did not record the bill: its rule or cycle changed.")
                Text("Finish this check, then decline the old proposal or request a new one.")
            } else if let receipt = saved.result?.approval.receipt {
                recorded(receipt)
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. No expense was recorded by this decision.")
            } else {
                Text("Not confirmed yet. Resolve this exact decision before reviewing another bill proposal.")
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
