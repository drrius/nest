import SwiftUI

enum TodayRoute: Hashable {
    case newChore, groceries, addGrocery, expense, chores
}

struct TodayScreen: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var everyone = false
    @State private var todayRefresh = UUID()
    @State private var clockStart = Date()
    @State private var adding = false
    @State private var route: TodayRoute?

    var body: some View {
        TimelineView(.periodic(from: clockStart, by: 60)) { clock in
            if let moment = try? TodayMoment(now: clock.date) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 30) {
                        forYou
                        TodayChoresSection(model: model, member: member, moment: moment, everyone: $everyone)
                        TodayMealsSection(model: model, member: member, day: moment.day, refresh: todayRefresh)
                            .id("\(model.generation):\(moment.day.value)")
                        TodayCalendarSection(session: model, member: member, refresh: todayRefresh)
                            .id(member.userId)
                        TodayShortcuts(model: model, member: member, refresh: todayRefresh)
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 6)
                    .padding(.bottom, 32)
                }
                .onChange(of: moment.day) { _, _ in
                    todayRefresh = UUID()
                    Task { await model.refreshToday() }
                }
            } else {
                ContentUnavailableView("Could not read today's date", systemImage: "calendar")
            }
        }
        .nestRootChrome(
            "Today", subtitle: (try? TodayMoment(now: clockStart))?.header, session: model, member: member
        ) {
            Button {
                adding = true
            } label: {
                Image(systemName: "plus")
            }
            .accessibilityLabel("Add to your household")
        }
        .sheet(isPresented: $adding) {
            TodayAddSheet { choice in
                adding = false
                route = choice
            }
        }
        .navigationDestination(item: $route) { destination($0) }
        .refreshable {
            todayRefresh = UUID()
            await model.refreshToday()
            await model.refreshGroceries()
        }
        .task { if model.today == .idle { await model.refreshToday() } }
        .task { if model.groceries == .idle { await model.refreshGroceries() } }
    }

    private var forYou: some View {
        VStack(spacing: 12) {
            TodayHandoverCard(model: model, member: member)
            TodayBillsSection(session: model, member: member, refresh: todayRefresh).id(member.userId)
            TodayApprovalsSection(model: model, member: member, refresh: todayRefresh).id(member.userId)
        }
    }

    @ViewBuilder
    private func destination(_ route: TodayRoute) -> some View {
        switch route {
        case .newChore: ChoreCreateScreen(model: model)
        case .groceries: GroceriesScreen(model: model)
        case .addGrocery: GroceriesScreen(model: model, initiallyAdding: true)
        case .expense: ExpenseScreen(session: model, member: member)
        case .chores: RoutinesScreen(model: model)
        }
    }
}
