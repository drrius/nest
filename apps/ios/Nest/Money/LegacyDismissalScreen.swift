import SwiftUI

struct LegacyDismissalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyDismissalModel
    @State private var confirmation: LegacyDismissalReview?
    @State private var confirmCancellation = false
    @Environment(\.scenePhase) private var phase
    @Environment(\.dismiss) private var dismiss

    init(session: SessionModel, member: VerifiedMember, draftId: UUID?) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: LegacyDismissalModel(session: session, member: member, draftId: draftId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                LegacyReviewedDraftTerms(draft: saved.reviewed.draft, member: member)
                recovery(saved)
            } else if let review = model.review {
                LegacyReviewedDraftTerms(draft: review.current.draft, member: member)
                Section {
                    if review.current.canDismiss {
                        Text(
                            "Dismiss only this unposted draft. It stays in history. No expense, payment or balance change is recorded, and the old rule stays as it is."
                        )
                        Button("Dismiss this draft", role: .destructive) { confirmation = review }
                    } else {
                        Text(
                            "This draft cannot be dismissed here. Only pending recurring drafts without a financial entry are eligible. Posted, linked or shopping records need reconciliation."
                        )
                    }
                }
            } else if model.loaded {
                Text("No saved draft dismissal.")
            }
            if let notice = model.notice { Section { Text(notice) } }
            Section { Button("Check current draft or saved result") { Task { await model.load() } } }
        }
        .disabled(model.working)
        .navigationTitle("Dismiss retained draft")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .onChange(of: phase) { _, phase in
            confirmation = nil
            if phase == .active {
                Task { await model.load() }
            } else {
                model.suspendReview()
            }
        }
        .confirmationDialog("Dismiss this reviewed draft?", isPresented: confirming) {
            if let expected = confirmation {
                Button("Dismiss this draft", role: .destructive) { Task { await model.confirm(expected) } }
            }
        } message: {
            Text("No expense or payment will be recorded, and no recurring rule will be paused or cancelled.")
        }
        .confirmationDialog("Cancel this pending request?", isPresented: $confirmCancellation) {
            Button("Cancel pending request", role: .destructive) { Task { await model.retry(cancel: true) } }
        } message: {
            Text("If dismissal already happened, Nest will recover that exact result instead.")
        }
    }

    private var confirming: Binding<Bool> {
        Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } })
    }

    @ViewBuilder
    private func recovery(_ saved: SavedLegacyDismissal) -> some View {
        Section("Saved dismissal request") {
            if saved.result?.status == .recorded {
                Text(
                    "Draft dismissed. No expense, payment or balance change was recorded. The old recurring rule is unchanged."
                )
            } else if saved.result?.status == .cancelled {
                Text("Request cancelled. This request did not dismiss the draft.")
            } else {
                Text("Not confirmed yet. Check this exact saved request before dismissing another draft.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry dismissal") {
                    Task { await model.retry() }
                }
                if !saved.cancellationRequested {
                    Button("Cancel pending request") { confirmCancellation = true }
                }
            }
            if let result = saved.result, result.status != .unresolved {
                Button("Finish recovery") { Task { if await model.finish() { dismiss() } } }
            }
        }
    }
}

struct LegacyReviewedDraftTerms: View {
    let draft: LegacyRecurringDraft
    let member: VerifiedMember

    var body: some View {
        Section("Original reviewed draft") {
            Text(LegacyRecurringLabel.display(draft.description)).font(.headline)
            LabeledContent("Status at review", value: draft.status.rawValue.capitalized)
            LabeledContent("Amount", value: draft.amountCentimes?.absoluteCHF ?? "Not specified")
            LabeledContent("Date", value: draft.occurredOn.display)
            if draft.payerId == nil { Text("The old payer is not specified.") }
            LegacySplitTerms(split: draft.allocations, payerId: draft.payerId, member: member)
            if draft.updatedAt.kind == .unsupported { Text("The old change date needs review.") }
            if draft.categoryId != nil { Text("This draft has a retained category.") }
            if draft.sourceKind == .shopping { Text("Kept from an old shopping session.") }
            if draft.eventId != nil { Text("This draft is already linked to a financial entry.") }
        }
    }
}
