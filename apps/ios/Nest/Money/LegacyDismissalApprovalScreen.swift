import SwiftUI

struct LegacyDismissalApprovalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyDismissalApprovalModel
    @State private var choice: (approved: Bool, review: LegacyDismissalProposalReview)?
    @State private var withdrawal = false
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(
            wrappedValue: LegacyDismissalApprovalModel(session: session, member: member, approvalId: approvalId))
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
        .navigationTitle("Review draft dismissal")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: phase) { _, phase in
            choice = nil
            withdrawal = false
            if phase == .active {
                Task { await model.load() }
            } else {
                model.suspendReview()
            }
        }
        .alert(
            choice?.approved == true ? "Dismiss this exact draft?" : "Decline this proposal?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let expected = choice {
                Button(expected.approved ? "Dismiss reviewed draft" : "Decline", role: .destructive) {
                    Task { await model.decide(expected.approved, expected: expected.review) }
                }
            }
            Button("Keep reviewing", role: .cancel) { choice = nil }
        } message: {
            Text(
                "Dismissal preserves history. It creates no expense, payment or balance change and leaves the old rule unchanged."
            )
        }
        .alert("Withdraw saved consent?", isPresented: $withdrawal) {
            Button("Withdraw consent", role: .destructive) { Task { await model.retry(withdraw: true) } }
            Button("Keep saved consent", role: .cancel) { withdrawal = false }
        } message: {
            Text("This fences a pending dismissal. If dismissal already committed, its exact recorded result wins.")
        }
    }

    @ViewBuilder private func terms(
        _ input: LegacyDismissInput, context: LegacyDismissalProposalContext?, receipt: LegacyDismissalReceipt?
    ) -> some View {
        if let receipt {
            LegacyReviewedDraftTerms(draft: receipt.reviewed.draft, member: member)
        } else if let context, context.matches {
            LegacyReviewedDraftTerms(draft: context.review.draft, member: member)
        } else {
            Section("Original proposal references") {
                LabeledContent("Draft", value: input.draftId.uuidString.lowercased())
                LabeledContent("Old rule", value: input.ruleId.uuidString.lowercased())
                Text(
                    "The current draft could not be matched to this proposal. Its current terms cannot replace the original review."
                )
                Text("Decline this proposal and request a new review if dismissal is still needed.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
        }
    }

    private func decision(_ review: LegacyDismissalProposalReview) -> some View {
        Section {
            if review.approval.status == .consumed {
                Text("Draft dismissed. No expense, payment or balance change was recorded.")
            } else if review.approval.status == .denied {
                Text("Proposal declined. This proposal did not dismiss the draft.")
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { clock in
                    if ApprovalTime.isOpen(review.approval.expiresAt, now: clock.date) {
                        if review.context?.matches == true {
                            Button("Review dismissal", role: .destructive) { choice = (true, review) }
                        }
                    } else {
                        Text("This proposal has expired. Confirmation is unavailable; you can still decline it.")
                    }
                }
                Button("Decline proposal", role: .destructive) { choice = (false, review) }
            }
        }
    }

    private func recovery(_ saved: SavedLegacyDismissalDecision) -> some View {
        Section("Saved decision") {
            Text(saved.decision.approved ? "You chose to dismiss this draft." : "You chose to decline this proposal.")
            if saved.result?.approval.status == .consumed {
                Text("Draft dismissed. The recorded outcome wins even if withdrawal was requested later.")
            } else if saved.result?.approval.status == .denied {
                Text("Proposal declined. This proposal did not dismiss the draft.")
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
}
