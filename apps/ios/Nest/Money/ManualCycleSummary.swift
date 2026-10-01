import SwiftUI

struct ManualCycleSummary: View {
    let member: VerifiedMember
    let input: ManualCycleInput
    let configuration: RecurringConfiguration
    let cycle: RecurringCycle
    let source: MoneyDetail

    var body: some View {
        Section("Existing expense") {
            Text(source.event.description).font(.headline)
            LabeledContent("Amount", value: source.event.amountCentimes.absoluteCHF)
            LabeledContent("Date", value: source.event.occurredOn)
            if let payer = source.event.payerId { LabeledContent("Paid by", value: name(payer)) }
            ForEach(source.shares) { share in
                if let amount = share.allocatedCentimes { LabeledContent(name(share.id), value: amount.absoluteCHF) }
            }
            if let category = source.category { LabeledContent("Category", value: category.name) }
            if let note = source.note { Text(note) }
        }
        Section("Bill cycle to cover") {
            Text(configuration.description).font(.headline)
            LabeledContent("Due date", value: input.dueOn.value)
            LabeledContent("Period", value: "\(cycle.startsOn.value) to \(cycle.through.value)")
            LabeledContent("Rule payer", value: name(configuration.payerId))
            if let amount = configuration.amountCentimes { LabeledContent("Rule amount", value: amount.absoluteCHF) }
            if let shares = configuration.allocations {
                ForEach(shares, id: \.memberId) { share in
                    LabeledContent("Rule share · \(name(share.memberId))", value: share.centimes.absoluteCHF)
                }
            } else { Text("The bill has a variable amount and split.") }
            if configuration.categoryId != nil { Text("The rule has a selected category.") }
            if let note = configuration.note { Text(note) }
            Text(
                "Use this existing expense even if its amount, payer or split differs from the rule. This covers one cycle and prevents another recurring posting for it. It creates no expense, payment or balance change. Your expense and future rule stay the same."
            )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func name(_ id: UUID) -> String { id == member.userId ? "You" : "Your partner" }
}
