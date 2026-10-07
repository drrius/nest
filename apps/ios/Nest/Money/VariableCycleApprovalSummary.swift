import SwiftUI

struct VariableCycleApprovalSummary: View {
    let member: VerifiedMember
    let input: VariableCycleInput
    let configuration: RecurringConfiguration?
    let recordedCycle: RecurringCycle?

    var body: some View {
        QuietFormSection(recordedCycle == nil ? "Bill being reviewed" : "Bill recorded") {
            Text(configuration?.description ?? "Bill proposal").font(.headline)
            QuietValueRow("Amount", value: input.amountCentimes.absoluteCHF)
            if let configuration { QuietValueRow("Payer", value: name(configuration.payerId)) }
            ForEach(input.allocations, id: \.memberId) { share in
                QuietValueRow(name(share.memberId), value: share.centimes.absoluteCHF)
            }
            QuietValueRow("Due date", value: input.dueOn.value)
            if let cycle {
                QuietValueRow("Cycle", value: "\(cycle.startsOn.value) to \(cycle.through.value)")
            }
            if configuration?.categoryId != nil { Text("Uses the bill’s selected category.").font(.footnote) }
            if let note = configuration?.note { Text(note) }
            Text("This records one expense. Nest does not pay the bill or change its recurring rule.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func name(_ id: UUID) -> String { id == member.userId ? "You" : "Your partner" }

    private var cycle: RecurringCycle? {
        if let recordedCycle { return recordedCycle }
        guard let configuration else { return nil }
        return try? RecurringDates.cycle(schedule: configuration.schedule, dueOn: input.dueOn)
    }
}
