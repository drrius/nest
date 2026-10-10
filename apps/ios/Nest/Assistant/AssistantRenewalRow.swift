import SwiftUI

struct AssistantRenewalRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantRenewalLink

    var body: some View {
        switch result {
        case .renewal(let receipt):
            Text(receipt.action == .removed ? "Renewal removed from Nest." : "Renewal saved.")
            Text(receipt.renewal.fields.title)
            NavigationLink {
                RenewalDetailScreen(session: session, member: member, renewalId: receipt.renewal.id)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current renewal")
            }
        case .reminder(let receipt):
            Text("Renewal reminder choices saved. This does not confirm delivery.")
            NavigationLink {
                RenewalReminderScreen(session: session, member: member, renewalId: receipt.reminder.renewalId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current reminder choices")
            }
        }
    }
}
