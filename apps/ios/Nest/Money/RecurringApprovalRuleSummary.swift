import SwiftUI

struct RecurringApprovalRuleSummary: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let rule: RecurringRule
    let title: String

    var body: some View {
        Section(title) {
            Text(rule.configuration.description).font(.headline)
            LabeledContent("Status", value: rule.status.rawValue.capitalized)
            LabeledContent("Payer", value: rule.configuration.payerId == member.userId ? "You" : "Your partner")
            if let amount = rule.configuration.amountCentimes {
                LabeledContent("Amount per cycle", value: amount.absoluteCHF)
            } else {
                Text("Variable amount · each cycle needs confirmation")
            }
            if let allocations = rule.configuration.allocations {
                ForEach(allocations, id: \.memberId) {
                    LabeledContent(
                        $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
                }
            }
            if rule.configuration.schedule.kind == .monthly {
                LabeledContent("Cadence", value: "Monthly on day \(rule.configuration.schedule.dayOfMonth ?? 1)")
            } else {
                let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                LabeledContent("Cadence", value: "Weekly on \(days[(rule.configuration.schedule.weekday ?? 1) - 1])")
            }
            LabeledContent("Starts", value: rule.configuration.startDate.value)
            if let due = rule.nextDueOn { LabeledContent("Next due", value: due.value) }
            NavigationLink("View current rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: rule.id).id(session.generation)
            }
        }
    }
}
