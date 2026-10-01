import SwiftUI

struct AssistantLegacyRecurringRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantLegacyRecurringLink

    var body: some View {
        Text("Retained history was read. This does not record an expense or enable automatic posting.")
            .font(.footnote).foregroundStyle(QuietPalette.muted)
        switch result {
        case .rules:
            NavigationLink("View current retained recurring expenses") {
                LegacyRecurringScreen(session: session, member: member).id(session.generation)
            }
        case .drafts(let ruleId):
            NavigationLink("View retained drafts for this rule") {
                LegacyDraftsScreen(session: session, member: member, ruleId: ruleId).id(session.generation)
            }
        }
    }
}
