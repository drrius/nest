import SwiftUI

struct HouseholdTabs: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember

    var body: some View {
        TabView {
            NavigationStack {
                TodayScreen(model: model, member: member)
            }
            .tabItem { Label("Today", systemImage: "house") }
            NavigationStack {
                MealWeekScreen(model: model)
                    .toolbar { AssistantEntry(session: model, member: member) }
            }
            .tabItem { Label("Meals", systemImage: "fork.knife") }
            NavigationStack {
                CalendarScreen(member: member, session: model)
                    .toolbar { AssistantEntry(session: model, member: member) }
            }
            .tabItem { Label("Calendar", systemImage: "calendar") }
            NavigationStack {
                MoneyScreen(session: model, member: member)
                    .toolbar { AssistantEntry(session: model, member: member) }
            }
            .tabItem { Label("Money", systemImage: "creditcard") }
        }
        .tint(QuietPalette.accent)
    }
}
