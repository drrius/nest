import SwiftUI

enum HouseholdTab: Hashable, Sendable {
    case today, meals, calendar, money, assistant
}

@MainActor
final class TabRouter: ObservableObject {
    @Published var selection: HouseholdTab = .today
}

struct HouseholdTabs: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @StateObject private var firstUse = FirstUseModel()
    @StateObject private var colours: MemberColourModel
    @StateObject private var router = TabRouter()
    @Environment(\.scenePhase) private var scenePhase

    init(model: SessionModel, member: VerifiedMember) {
        self.model = model
        self.member = member
        _colours = StateObject(
            wrappedValue: MemberColourModel(member: member, sync: .session(model, member: member)))
    }

    var body: some View {
        TabView(selection: $router.selection) {
            Tab("Today", systemImage: "house", value: HouseholdTab.today) {
                NavigationStack { TodayScreen(model: model, member: member) }
            }
            Tab("Meals", systemImage: "fork.knife", value: HouseholdTab.meals) {
                NavigationStack { MealWeekScreen(model: model) }
            }
            Tab("Calendar", systemImage: "calendar", value: HouseholdTab.calendar) {
                NavigationStack { CalendarScreen(member: member, session: model) }
            }
            Tab("Money", systemImage: "creditcard", value: HouseholdTab.money) {
                NavigationStack { MoneyScreen(session: model, member: member) }
            }
            // On iOS 26 this becomes the separate glass button beside the tab bar.
            Tab("Ask Nest", systemImage: "sparkles", value: HouseholdTab.assistant, role: .search) {
                NavigationStack {
                    AssistantConversationsScreen(session: model, member: member).id(model.generation)
                }
            }
        }
        .tint(NestColor.accent)
        .task { firstUse.load(session: model, member: member) }
        .task { await colours.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await colours.refresh() } }
        }
        .sheet(isPresented: $firstUse.presented) {
            FirstUseScreen(session: model, member: member, entry: firstUse)
        }
        .onChange(of: model.generation) { firstUse.clear() }
        .environment(\.memberPalette, palette)
        .environment(\.switchTab, TabSwitchAction { [router] tab in router.selection = tab })
        .environmentObject(colours)
    }

    private var palette: MemberPalette {
        var members: [NestMember] = []
        if case .loaded(let state) = model.today { members = state.snapshot.members }
        return colours.palette(members: members)
    }
}
