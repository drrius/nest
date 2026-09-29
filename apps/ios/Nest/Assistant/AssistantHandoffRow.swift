import SwiftUI

struct AssistantHandoffRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let handoff: AssistantHandoff

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch handoff {
            case .calendar:
                NavigationLink("Open Calendar") {
                    CalendarScreen(member: member, session: session).id(session.generation)
                }
                Text("Choose calendars on your iPhone. Personal event details stay on this device.")
            case .calendarSharing:
                NavigationLink("Review busy sharing") {
                    CalendarSharingScreen(session: session).id(session.generation)
                }
                Text("Sharing has not changed. Review your choices before enabling it.")
            case .ingredients(let week):
                NavigationLink("Review ingredients") {
                    IngredientReviewScreen(model: session, week: week).id(session.generation)
                }
                Text("Nothing was added. Review the current meal week and choose what you need.")
            }
        }
        .font(.footnote)
        .foregroundStyle(QuietPalette.muted)
        .buttonStyle(.bordered)
        .tint(QuietPalette.accent)
    }
}
