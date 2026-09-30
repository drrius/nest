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
            case .notifications:
                NavigationLink("Review notifications") {
                    NotificationPreferencesScreen(session: session, member: member).id(session.generation)
                }
                Text(
                    "No choices or iPhone permissions changed. Open this iPhone’s connection to review device enrollment."
                )
            case .setup:
                NavigationLink("Review your setup") {
                    SetupScreen(session: session, member: member).id(session.generation)
                }
                Text("Nothing was saved. Review or skip each optional part on your iPhone.")
            case .settings:
                NavigationLink("Open Profile") {
                    ProfileScreen(model: session, member: member).id(session.generation)
                }
                Text("Your account has not changed. Sign-out requires the explicit native control.")
            }
        }
        .font(.footnote)
        .foregroundStyle(QuietPalette.muted)
        .buttonStyle(.bordered)
        .tint(QuietPalette.accent)
    }
}
