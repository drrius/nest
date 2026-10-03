import SwiftUI

struct HouseholdTabs: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @StateObject private var firstUse = FirstUseModel()

    var body: some View {
        TabView {
            NavigationStack {
                TodayScreen(model: model, member: member)
            }
            .tabItem { Label("Today", systemImage: "house") }
            NavigationStack {
                MealWeekScreen(model: model)
            }
            .tabItem { Label("Meals", systemImage: "fork.knife") }
            NavigationStack {
                CalendarScreen(member: member, session: model)
            }
            .tabItem { Label("Calendar", systemImage: "calendar") }
            NavigationStack {
                MoneyScreen(session: model, member: member)
            }
            .tabItem { Label("Money", systemImage: "creditcard") }
        }
        .tint(QuietPalette.accent)
        .task { firstUse.load(session: model, member: member) }
        .sheet(isPresented: $firstUse.presented) {
            FirstUseScreen(session: model, member: member, entry: firstUse)
        }
        .onChange(of: model.generation) { firstUse.clear() }
    }
}
