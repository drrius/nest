import SwiftUI

struct RecurringApprovalRuleSummary: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let rule: RecurringRule
    let title: String
    var recordedResume: RecurringResumeReceipt? = nil

    private var configuration: RecurringConfiguration { recordedResume?.configuration ?? rule.configuration }

    var body: some View {
        Section(title) {
            Text(configuration.description).font(.headline)
            QuietValueRow("Status", value: (recordedResume?.status ?? rule.status).rawValue.capitalized)
            QuietValueRow("Payer", value: configuration.payerId == member.userId ? "You" : "Your partner")
            if let amount = configuration.amountCentimes {
                QuietValueRow("Amount per cycle", value: amount.absoluteCHF)
            } else {
                Text("Variable amount · each cycle needs confirmation")
            }
            if let allocations = configuration.allocations {
                ForEach(allocations, id: \.memberId) {
                    QuietValueRow(
                        $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
                }
            }
            if configuration.schedule.kind == .monthly {
                QuietValueRow("Cadence", value: "Monthly on day \(configuration.schedule.dayOfMonth ?? 1)")
            } else {
                let days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
                QuietValueRow("Cadence", value: "Weekly on \(days[(configuration.schedule.weekday ?? 1) - 1])")
            }
            QuietValueRow("Starts", value: configuration.startDate.value)
            if let note = configuration.note { Text(note) }
            if recordedResume == nil, let due = rule.nextDueOn { QuietValueRow("Next due", value: due.value) }
            NavigationLink("View current rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: rule.id).id(session.generation)
            }
        }
    }
}
