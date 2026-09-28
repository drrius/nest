import SwiftUI

struct ExpenseReviewSection: View {
    let expense: ExpenseInput
    let member: VerifiedMember
    let members: [MoneyBalance.Member]

    var body: some View {
        Section("Review expense") {
            Text(expense.description).font(.headline)
            LabeledContent("Shared amount", value: expense.amountCentimes.absoluteCHF)
            if let total = expense.receiptTotalCentimes { LabeledContent("Receipt total", value: total.absoluteCHF) }
            LabeledContent("Paid by", value: name(expense.payerId))
            LabeledContent("Date", value: expense.date.value)
            ForEach(expense.allocations, id: \.memberId) { share in
                LabeledContent("\(name(share.memberId))’s share", value: share.centimes.absoluteCHF)
            }
            if let note = expense.note { Text(note) }
            Text("Saving records this expense in your shared financial history. It does not transfer money.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func name(_ id: UUID) -> String {
        if id == member.userId { return "You" }
        return members.first(where: { $0.id == id })?.displayName ?? "Your partner"
    }
}
