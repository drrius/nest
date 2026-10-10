import SwiftUI

struct ApprovalOriginalEntry: View {
    let detail: MoneyDetail
    let member: VerifiedMember

    var body: some View {
        QuietFormSection("Original entry") {
            Text(detail.event.description).font(.headline)
            QuietValueRow("Amount", value: detail.event.amountCentimes.absoluteCHF)
            QuietValueRow("Date", value: detail.event.occurredOn)
            QuietValueRow("Payer", value: detail.event.payerId == member.userId ? "You" : "Your partner")
            ForEach(detail.shares) { share in
                if let amount = share.allocatedCentimes {
                    QuietValueRow(
                        share.id == member.userId ? "Your share" : "Partner’s share", value: amount.absoluteCHF)
                }
            }
            if let category = detail.category { QuietValueRow("Category", value: category.name) }
            if let note = detail.note { Text(note) }
            if detail.reversedById != nil { Text("This entry already has a recorded reversal.") }
        }
    }
}
