import SwiftUI

struct LegacyAdoptionApprovalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyAdoptionApprovalModel
    @State private var choice: (approved: Bool, review: LegacyAdoptionProposalReview)?
    @State private var withdrawal = false
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: LegacyAdoptionApprovalModel(session: session, member: member, approvalId: approvalId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                terms(saved.decision.input, context: saved.reviewedContext, receipt: saved.result?.approval.receipt)
                recovery(saved)
            } else if let review = model.review {
                terms(review.approval.input, context: review.context, receipt: review.approval.receipt)
                decision(review)
            }
            if let notice = model.notice { Section { Text(notice) } }
            Section {
                Button {
                    Task { await model.load() }
                } label: {
                    QuietActionLabel("Check private proposal or saved result")
                }
            }
        }
        .disabled(model.working)
        .navigationTitle("Rule proposal")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: phase) { _, phase in
            choice = nil
            withdrawal = false
            if phase == .active { Task { await model.load() } } else { model.suspendReview() }
        }
        .alert(
            choice?.approved == true ? "Adopt terms?" : "Decline?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let expected = choice {
                Button(expected.approved ? "Adopt" : "Decline", role: expected.approved ? nil : .destructive) {
                    Task { await model.decide(expected.approved, expected: expected.review) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text(choice?.approved == true ? "Future bills only." : "No rule is adopted.")
        }
        .alert("Withdraw?", isPresented: $withdrawal) {
            Button("Withdraw", role: .destructive) { Task { await model.retry(withdraw: true) } }
            Button("Cancel", role: .cancel) { withdrawal = false }
        } message: {
            Text("Recorded results win.")
        }
    }

    @ViewBuilder private func terms(
        _ input: LegacyAdoptionInput, context: LegacyAdoptionProposalContext?, receipt: LegacyAdoptionReceipt?
    ) -> some View {
        if let receipt {
            LegacyAdoptionTerms(context: receipt.reviewed, member: member)
        } else if let context, context.matches {
            LegacyAdoptionTerms(context: context.review, member: member)
        } else {
            Section("Original proposal reference") {
                LabeledContent("Old rule", value: input.ruleId.uuidString.lowercased())
                Text("The current rule cannot replace the original review. Decline and request a new proposal.")
            }
        }
        LegacyAdoptionNewTerms(input: input, members: model.members, member: member, categoryName: model.categoryName)
    }

    private func decision(_ review: LegacyAdoptionProposalReview) -> some View {
        Section {
            Text(
                "Adoption keeps previous history and stops the old draft generator. Fixed expenses record automatically in future cycles; variable bills need confirmation."
            )
            if review.approval.status == .consumed {
                Text("Rule adopted. This save added no expense or bank transfer.")
                if let receipt = review.approval.receipt { entry(receipt) }
            } else if review.approval.status == .denied {
                Text("Proposal declined. This proposal did not adopt a rule.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(review.approval.expiresAt, now: clock.date) {
                        if review.canConfirm {
                            Button {
                                choice = (true, review)
                            } label: {
                                QuietActionLabel("Review proposed rule")
                            }
                        } else {
                            Text(
                                "The source, people or prospective dates no longer match this proposal. Adoption is unavailable."
                            )
                        }
                    } else {
                        Text("This proposal has expired. Adoption is unavailable; you can still decline it.")
                    }
                }.buttonStyle(.borderless)
                Button(role: .destructive) {
                    choice = (false, review)
                } label: {
                    QuietActionLabel("Decline proposal")
                }
            }
        }
    }

    private func recovery(_ saved: SavedLegacyAdoptionDecision) -> some View {
        Section("Saved decision") {
            Text(
                saved.decision.approved
                    ? "You chose to adopt these exact proposed terms." : "You chose to decline this proposal.")
            if let receipt = saved.result?.approval.receipt {
                Text("Rule adopted. Its exact outcome wins even if withdrawal was requested later.")
                entry(receipt)
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. This proposal did not adopt a rule.")
            } else {
                Text("Not confirmed. Changed rule terms alone cannot finish this saved decision.")
                Button {
                    Task { await model.retry() }
                } label: {
                    QuietActionLabel(saved.withdrawalRequested ? "Retry withdrawal" : "Check and retry exact decision")
                }
                if saved.decision.approved && !saved.withdrawalRequested {
                    Button(role: .destructive) {
                        withdrawal = true
                    } label: {
                        QuietActionLabel("Withdraw saved consent")
                    }
                }
            }
            if saved.isTerminal {
                Button {
                    Task { if await model.finish() { dismiss() } }
                } label: {
                    QuietActionLabel("Finish recovery")
                }
            }
        }
    }

    private func entry(_ receipt: LegacyAdoptionReceipt) -> some View {
        NavigationLink {
            RecurringRuleScreen(session: session, member: member, ruleId: receipt.input.ruleId).id(session.generation)
        } label: {
            QuietActionLabel("View adopted rule")
        }
    }
}
