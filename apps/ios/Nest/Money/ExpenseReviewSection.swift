import SwiftUI

struct ExpenseReviewSection: View {
    let expense: ExpenseInput
    let member: VerifiedMember
    let members: [MoneyBalance.Member]
    var categoryName: String? = nil
    var unknownCategoryLabel = "Previously selected category"
    var unknownMemberLabel = "Your partner"

    var body: some View {
        QuietFormSection("Review expense") {
            Text(expense.description).font(.headline)
            row("Shared amount", expense.amountCentimes.absoluteCHF)
                .accessibilityIdentifier("expense-review-amount")
            if let total = expense.receiptTotalCentimes { row("Receipt total", total.absoluteCHF) }
            row("Paid by", name(expense.payerId))
                .accessibilityIdentifier("expense-review-payer")
            row("Date", expense.date.value)
            ForEach(expense.allocations, id: \.memberId) { share in
                row(
                    share.memberId == member.userId ? "Your share" : "\(name(share.memberId))’s share",
                    share.centimes.absoluteCHF
                )
                .accessibilityIdentifier("expense-share-\(share.memberId.uuidString.lowercased())")
            }
            if expense.categoryId != nil {
                row("Category", categoryName ?? unknownCategoryLabel)
            }
            if expense.receiptPath != nil { Label("Receipt attached", systemImage: "paperclip") }
            if let note = expense.note { Text(note) }
            Text("Saving records this expense in your shared financial history. It does not transfer money.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        LabeledContent {
            Text(value).foregroundStyle(QuietPalette.ink)
        } label: {
            Text(title).foregroundStyle(QuietPalette.ink)
        }
    }

    private func name(_ id: UUID) -> String {
        if id == member.userId { return "You" }
        return members.first(where: { $0.id == id })?.displayName ?? unknownMemberLabel
    }
}
