import SwiftUI

struct LegacyConfirmationApprovalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyConfirmationApprovalModel
    @State private var choice: (approved: Bool, review: LegacyConfirmationProposalReview)?
    @State private var withdrawal = false
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: LegacyConfirmationApprovalModel(session: session, member: member, approvalId: approvalId))
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
            Section { Button("Check private proposal or saved result") { Task { await model.load() } } }
        }
        .disabled(model.working)
        .navigationTitle("Expense proposal")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: phase) { _, phase in
            choice = nil
            withdrawal = false
            if phase == .active { Task { await model.load() } } else { model.suspendReview() }
        }
        .alert(
            choice?.approved == true ? "Record expense?" : "Decline?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let expected = choice {
                Button(expected.approved ? "Record" : "Decline", role: expected.approved ? nil : .destructive) {
                    Task { await model.decide(expected.approved, expected: expected.review) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text(choice?.approved == true ? "Changes your shared balance." : "No expense is recorded.")
        }
        .alert("Withdraw?", isPresented: $withdrawal) {
            Button("Withdraw", role: .destructive) { Task { await model.retry(withdraw: true) } }
            Button("Cancel", role: .cancel) { withdrawal = false }
        } message: {
            Text("Recorded results win.")
        }
    }

    @ViewBuilder private func terms(
        _ input: LegacyConfirmInput, context: LegacyConfirmationProposalContext?, receipt: LegacyConfirmationReceipt?
    ) -> some View {
        if let receipt {
            LegacyReviewedDraftTerms(draft: receipt.reviewed.draft, member: member)
        } else if let context, context.matches {
            LegacyReviewedDraftTerms(draft: context.review.draft, member: member)
        } else {
            Section("Original proposal references") {
                LabeledContent("Draft", value: input.draftId.uuidString.lowercased())
                LabeledContent("Old rule", value: input.ruleId.uuidString.lowercased())
                Text("The current draft cannot replace the original review. Decline and request a new proposal.")
            }
        }
        ExpenseReviewSection(
            expense: input.expense, member: member, members: model.members,
            unknownMemberLabel: "Other member at review")
    }

    private func decision(_ review: LegacyConfirmationProposalReview) -> some View {
        Section {
            Text(
                "Recording links this newly proposed expense to the retained draft. The old rule is not enabled for automatic posting."
            )
            if review.approval.status == .consumed {
                Text("Expense recorded. No bank transfer occurred.")
                if let receipt = review.approval.receipt { entry(receipt) }
            } else if review.approval.status == .denied {
                Text("Proposal declined. This proposal did not record an expense.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(review.approval.expiresAt, now: clock.date) {
                        if review.canConfirm {
                            Button("Review proposed expense") { choice = (true, review) }
                        } else {
                            Text(
                                "The original draft or current people no longer match this proposal. Recording is unavailable."
                            )
                        }
                    } else {
                        Text("This proposal has expired. Recording is unavailable; you can still decline it.")
                    }
                }
                Button("Decline proposal", role: .destructive) { choice = (false, review) }
            }
        }
    }

    private func recovery(_ saved: SavedLegacyConfirmationDecision) -> some View {
        Section("Saved decision") {
            Text(
                saved.decision.approved
                    ? "You chose to record this proposed expense." : "You chose to decline this proposal.")
            if let receipt = saved.result?.approval.receipt {
                Text("Expense recorded. Its exact outcome wins even if withdrawal was requested later.")
                entry(receipt)
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. This proposal did not record an expense.")
            } else {
                Text("Not confirmed. Changed draft terms alone cannot finish this saved decision.")
                Button(saved.withdrawalRequested ? "Retry withdrawal" : "Check and retry exact decision") {
                    Task { await model.retry() }
                }
                if saved.decision.approved && !saved.withdrawalRequested {
                    Button("Withdraw saved consent", role: .destructive) { withdrawal = true }
                }
            }
            if saved.isTerminal {
                Button("Finish recovery") { Task { if await model.finish() { dismiss() } } }
            }
        }
    }

    private func entry(_ receipt: LegacyConfirmationReceipt) -> some View {
        NavigationLink("View recorded entry") {
            MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId).id(session.generation)
        }
    }
}
