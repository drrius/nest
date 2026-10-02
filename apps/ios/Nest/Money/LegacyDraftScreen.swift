import SwiftUI

struct LegacyDraftScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let draft: LegacyRecurringDraft

    var body: some View {
        List {
            Section("Retained draft terms") {
                Text(draft.description).font(.headline)
                LabeledContent("Status", value: draft.status.rawValue.capitalized)
                LabeledContent("Amount", value: draft.amountCentimes?.absoluteCHF ?? "Needs review")
                LabeledContent("Date", value: draft.occurredOn.display)
                if draft.updatedAt.kind == .unsupported { Text("The old change date needs review.") }
                LegacySplitTerms(split: draft.allocations, payerId: draft.payerId, member: member)
                Text(
                    draft.sourceKind == .shopping
                        ? "Kept from an old shopping session." : "Kept from an old recurring rule."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
                if draft.needsReconciliation {
                    Text(
                        "The retained status and linked entry need review. Neither this status nor this draft changes your balance."
                    )
                }
                Text("This is a retained snapshot. Viewing it does not record an expense or enable automatic posting.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
            if draft.status == .pending, draft.sourceKind == .recurring, draft.eventId == nil {
                Section {
                    NavigationLink("Review dismissal of this draft") {
                        LegacyDismissalScreen(session: session, member: member, draftId: draft.id)
                            .id(session.generation)
                    }
                }
            }
            if let eventId = draft.eventId {
                Section {
                    NavigationLink("View recorded entry") {
                        MoneyDetailScreen(session: session, member: member, eventId: eventId).id(session.generation)
                    }
                }
            }
        }
        .navigationTitle("Retained draft")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
    }
}

struct LegacySplitTerms: View {
    let split: LegacyRecurringSplit
    let payerId: UUID?
    let member: VerifiedMember

    var body: some View {
        if let payerId { LabeledContent("Retained payer", value: payerId == member.userId ? "You" : "Other member") }
        if let shares = split.shares {
            ForEach(shares, id: \.memberId) { share in
                LabeledContent(
                    share.memberId == member.userId ? "Your retained share" : "Other retained share",
                    value: share.centimes.absoluteCHF)
            }
        } else {
            Text("The old split needs review. No shares have been assumed.")
        }
    }
}
