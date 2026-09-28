import SwiftUI

struct ApprovalOriginalEntry: View {
    let detail: MoneyDetail
    let member: VerifiedMember

    var body: some View {
        Section("Original entry") {
            Text(detail.event.description).font(.headline)
            LabeledContent("Amount", value: detail.event.amountCentimes.absoluteCHF)
            LabeledContent("Date", value: detail.event.occurredOn)
            LabeledContent("Payer", value: detail.event.payerId == member.userId ? "You" : "Your partner")
            ForEach(detail.shares) { share in
                if let amount = share.allocatedCentimes {
                    LabeledContent(
                        share.id == member.userId ? "Your share" : "Partner’s share", value: amount.absoluteCHF)
                }
            }
            if let category = detail.category { LabeledContent("Category", value: category.name) }
            if let note = detail.note { Text(note) }
            if detail.reversedById != nil { Text("This entry already has a recorded reversal.") }
        }
    }
}
