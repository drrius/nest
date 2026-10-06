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
            NavigationLink {
                LegacyRecurringScreen(session: session, member: member).id(session.generation)
            } label: {
                QuietActionLabel("View current retained recurring expenses")
            }
        case .drafts(let ruleId):
            NavigationLink {
                LegacyDraftsScreen(session: session, member: member, ruleId: ruleId).id(session.generation)
            } label: {
                QuietActionLabel("View retained drafts for this rule")
            }
        }
    }
}
