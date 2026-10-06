import SwiftUI

struct TodayScreen: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var everyone = false
    @State private var todayRefresh = UUID()
    @State private var clockStart = Date()

    var body: some View {
        TimelineView(.periodic(from: clockStart, by: 60)) { clock in
            if let moment = try? TodayMoment(now: clock.date) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        TodayHeader(model: model, member: member, moment: moment)
                        quickAdd.padding(.top, QuietTabLayout.sectionSpacing)
                        TodayChoreFilter(everyone: $everyone).padding(.top, 24)
                        Text("Around the house")
                            .font(.headline)
                            .foregroundStyle(QuietPalette.ink)
                            .padding(.top, 30)
                        if let notice = model.todayNotice {
                            Text(notice)
                                .font(.subheadline)
                                .foregroundStyle(QuietPalette.muted)
                                .padding(.top, 14)
                            Button {
                                Task { await model.refreshToday() }
                            } label: {
                                Text("Retry sync")
                                    .frame(minHeight: 44, alignment: .leading)
                                    .contentShape(Rectangle())
                            }
                            .font(.subheadline.weight(.medium))
                            .padding(.top, 8)
                        }
                        content(moment: moment)
                        NavigationLink {
                            RoutinesScreen(model: model)
                        } label: {
                            QuietActionLabel("Manage chores")
                        }.padding(.top, 8)
                        TodayMealsSection(model: model, member: member, day: moment.day, refresh: todayRefresh)
                            .id(member.userId)
                            .padding(.top, 24)
                        TodayBillsSection(session: model, member: member, refresh: todayRefresh)
                            .id(member.userId)
                        TodayCalendarSection(session: model, member: member, refresh: todayRefresh)
                            .id(member.userId)
                            .padding(.top, 24)
                        TodayApprovalsSection(model: model, member: member, refresh: todayRefresh)
                            .id(member.userId)
                            .padding(.top, 24)
                        NavigationLink {
                            RenewalsScreen(session: model, member: member).id(model.generation)
                        } label: {
                            QuietActionLabel("Manage renewals")
                        }
                        NavigationLink {
                            GroceriesScreen(model: model)
                        } label: {
                            TodayGroceryShortcut(summary: grocerySummary)
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 28)
                        NavigationLink {
                            DailySummaryScreen(session: model, member: member).id(model.generation)
                        } label: {
                            QuietActionLabel("Your saved daily summary")
                        }.padding(.top, 12)
                    }
                    .modifier(QuietTabContentInsets())
                }
                .clipped()
                .onChange(of: moment.day) { _, _ in
                    todayRefresh = UUID()
                    Task { await model.refreshToday() }
                }
            } else {
                ContentUnavailableView("Could not read today's date", systemImage: "calendar")
            }
        }
        .background(QuietPalette.background)
        .modifier(QuietTabScrollEdges())
        .refreshable {
            todayRefresh = UUID()
            await model.refreshToday()
            await model.refreshGroceries()
        }
        .task { if model.today == .idle { await model.refreshToday() } }
        .task { if model.groceries == .idle { await model.refreshGroceries() } }
    }

    private var quickAdd: some View {
        Menu {
            NavigationLink {
                ChoreCreateScreen(model: model)
            } label: {
                Label("Chore", systemImage: "checkmark.circle")
            }
            NavigationLink {
                GroceriesScreen(model: model, initiallyAdding: true)
            } label: {
                Label("Grocery", systemImage: "basket")
            }
            NavigationLink {
                ExpenseScreen(session: model, member: member)
            } label: {
                Label("Expense", systemImage: "creditcard")
            }
        } label: {
            Label("Add", systemImage: "plus")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 18)
                .frame(minHeight: 44)
                .foregroundStyle(QuietPalette.surface)
                .background(QuietPalette.accent, in: Capsule())
        }
        .accessibilityLabel("Add to your household")
    }

    private var grocerySummary: String {
        switch model.groceries {
        case .idle, .loading: return "Loading your list"
        case .failed: return "Could not load · open to retry"
        case .loaded(let state):
            let conflicts = state.items.filter { $0.state == .conflict }.count
            if conflicts > 0 { return conflicts == 1 ? "1 change needs review" : "\(conflicts) changes need review" }
            let pending = state.items.filter { $0.state == .pending || $0.state == .acknowledged }.count
            if pending > 0 { return pending == 1 ? "1 saved change syncing" : "\(pending) saved changes syncing" }
            let count = state.items.filter { !$0.checked }.count
            return count == 1 ? "1 thing to pick up" : "\(count) things to pick up"
        }
    }

    @ViewBuilder
    private func content(moment: TodayMoment) -> some View {
        switch model.today {
        case .idle, .loading:
            ProgressView("Loading chores…").padding(.top, 24)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("Could not load your chores. Try again online.")
                Button {
                    Task { await model.refreshToday() }
                } label: {
                    Text("Retry").frame(minWidth: 44, minHeight: 44, alignment: .leading).contentShape(Rectangle())
                }
            }
            .foregroundStyle(QuietPalette.muted)
            .padding(.top, 24)
        case .loaded(let state):
            let visible = state.chores.filter {
                $0.visibleToday(on: moment.day, actor: member.userId, everyone: everyone)
            }
            if visible.isEmpty {
                Text("Nothing due in this view.")
                    .foregroundStyle(QuietPalette.muted)
                    .padding(.top, 24)
            } else {
                ForEach(visible) { chore in choreRow(chore, moment: moment) }
            }
        }
    }

    @ViewBuilder
    private func choreRow(_ item: LocalChore, moment: TodayMoment) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if item.state == .open {
                Button {
                    Task { await model.complete(item.chore) }
                } label: {
                    choreLabel(item, moment: moment)
                }
                .buttonStyle(.plain)
            } else {
                choreLabel(item, moment: moment)
            }
            if item.state == .conflict, let operation = item.operationId {
                Button {
                    Task { await model.discard(operation) }
                } label: {
                    Text("Discard saved change")
                        .frame(minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .font(.caption.weight(.medium))
                .padding(.leading, 38)
                .padding(.bottom, 10)
            }
        }
        .overlay(alignment: .bottom) { QuietPalette.border.frame(height: 1) }
    }

    private func choreLabel(_ item: LocalChore, moment: TodayMoment) -> some View {
        HStack(spacing: 14) {
            Image(systemName: choreSymbol(item.state))
                .font(.title3)
                .foregroundStyle(QuietPalette.accent)
            VStack(alignment: .leading, spacing: 3) {
                Text(item.chore.title).foregroundStyle(QuietPalette.ink)
                Text(detail(item, moment: moment)).font(.caption).foregroundStyle(QuietPalette.muted)
            }
            Spacer()
        }
        .frame(minHeight: 64)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.chore.title)
        .accessibilityValue(detail(item, moment: moment))
    }

    private func choreSymbol(_ state: LocalChore.State) -> String {
        switch state {
        case .open: "circle"
        case .pending: "clock"
        case .completed: "checkmark.circle.fill"
        case .conflict: "exclamationmark.circle"
        }
    }

    private func detail(_ item: LocalChore, moment: TodayMoment) -> String {
        let state =
            switch item.state {
            case .open: moment.dueLabel(item.chore.dueDate)
            case .pending: "Saved · waiting to sync"
            case .completed: "Done"
            case .conflict: item.conflictReason?.message ?? "Needs review · change was not applied"
            }
        return state
    }
}
