import SwiftUI

struct AssistantHandoffRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let handoff: AssistantHandoff

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            switch handoff {
            case .calendar:
                NavigationLink {
                    CalendarScreen(member: member, session: session).id(session.generation)
                } label: {
                    QuietActionLabel("Open Calendar")
                        .foregroundStyle(QuietPalette.accent)
                }
                Text("Choose calendars on your iPhone. Personal event details stay on this device.")
            case .calendarSharing:
                NavigationLink {
                    CalendarSharingScreen(session: session).id(session.generation)
                } label: {
                    QuietActionLabel("Review busy sharing")
                        .foregroundStyle(QuietPalette.accent)
                }
                Text("Sharing has not changed. Review your choices before enabling it.")
            case .ingredients(let week):
                NavigationLink {
                    IngredientReviewScreen(model: session, week: week).id(session.generation)
                } label: {
                    QuietActionLabel("Review ingredients")
                        .foregroundStyle(QuietPalette.accent)
                }
                Text("Nothing was added. Review the current meal week and choose what you need.")
            case .notifications:
                NavigationLink {
                    NotificationPreferencesScreen(session: session, member: member).id(session.generation)
                } label: {
                    QuietActionLabel("Review notifications")
                        .foregroundStyle(QuietPalette.accent)
                }
                Text(
                    "No choices or iPhone permissions changed. Open this iPhone’s connection to review device enrollment."
                )
            case .setup:
                NavigationLink {
                    SetupScreen(session: session, member: member).id(session.generation)
                } label: {
                    QuietActionLabel("Review your setup")
                        .foregroundStyle(QuietPalette.accent)
                }
                Text("Nothing was saved. Review or skip each optional part on your iPhone.")
            case .settings:
                NavigationLink {
                    ProfileScreen(model: session, member: member).id(session.generation)
                } label: {
                    QuietActionLabel("Open Profile")
                        .foregroundStyle(QuietPalette.accent)
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
