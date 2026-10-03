import SwiftUI

struct LegacyAdoptionTerms: View {
    let context: LegacyAdoptionContext
    let member: VerifiedMember

    var body: some View {
        LegacyRecurringTerms(rule: context.rule, member: member)
        Section("Before changing this rule") {
            if let covered = context.coveredThrough {
                LabeledContent("History covered through", value: covered.value)
                Text("Bills covering old history are skipped.").font(.footnote)
            }
            ForEach(context.blockers, id: \.rawValue) { blocker in
                Text(message(blocker))
            }
            Text("The old active setting is not consent to automatic expenses. New terms need your explicit review.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func message(_ blocker: LegacyAdoptionContext.Blocker) -> String {
        switch blocker {
        case .alreadyAdopted: "This rule has already been moved to Nest. Open the current recurring rule."
        case .identityInUse: "A current rule already uses this identity. This needs verified reconciliation."
        case .pendingDrafts:
            "Review the remaining old drafts first: record an expense or dismiss each draft explicitly."
        case .unreconciledHistory: "Old statuses and financial entries disagree. Verified reconciliation is needed."
        case .unsupportedDates:
            "History contains dates Nest cannot safely schedule beyond. Verified reconciliation is needed."
        }
    }
}

struct LegacyAdoptionNewTerms: View {
    let input: LegacyAdoptionInput
    let members: [MoneyBalance.Member]
    let member: VerifiedMember
    var categoryName: String? = nil

    var body: some View {
        Section("New terms to approve") {
            Text(input.configuration.description).font(.headline)
            Text(
                input.configuration.mode == .fixed
                    ? "Automatically record this fixed expense each cycle" : "Ask for amount and split each cycle")
            LabeledContent("Payer", value: name(input.configuration.payerId))
            if let amount = input.configuration.amountCentimes { LabeledContent("Amount", value: amount.absoluteCHF) }
            ForEach(input.configuration.allocations ?? [], id: \.memberId) { allocation in
                LabeledContent(name(allocation.memberId), value: allocation.centimes.absoluteCHF)
            }
            LabeledContent("Starts", value: input.configuration.startDate.value)
            LabeledContent("First uncovered bill", value: input.firstDueOn.value)
            Text(
                input.configuration.schedule.kind == .monthly
                    ? "Monthly, day \(input.configuration.schedule.dayOfMonth ?? 1)"
                    : "Every \(weekdays[(input.configuration.schedule.weekday ?? 1) - 1])")
            if input.configuration.categoryId != nil {
                LabeledContent("Category", value: categoryName ?? "Category chosen at review")
            }
            if let note = input.configuration.note { Text(note) }
            Text("Previous history is kept. Saving adds no expense today and makes no bank transfer.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private var weekdays: [String] { ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] }
    private func name(_ id: UUID) -> String {
        members.first(where: { $0.id == id })?.displayName ?? (id == member.userId ? "You" : "Other member at review")
    }
}
