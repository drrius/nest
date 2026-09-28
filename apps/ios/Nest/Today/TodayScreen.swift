import SwiftUI

struct TodayScreen: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var everyone = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                        .font(.caption)
                        .foregroundStyle(QuietPalette.muted)
                    Spacer()
                    Button {
                        Task { await model.signOut() }
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .font(.title2)
                            .foregroundStyle(QuietPalette.accent)
                    }
                    .accessibilityLabel("Sign out")
                }
                Text("Today")
                    .font(.largeTitle.weight(.semibold))
                    .foregroundStyle(QuietPalette.ink)
                    .padding(.top, 4)
                Text("A good day to keep it simple.")
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                    .padding(.top, 3)
                Picker("Show chores", selection: $everyone) {
                    Text("Me + shared").tag(false)
                    Text("Everyone").tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.top, 24)
                Text("Around the house")
                    .font(.headline)
                    .foregroundStyle(QuietPalette.ink)
                    .padding(.top, 30)
                if let notice = model.todayNotice {
                    Text(notice)
                        .font(.subheadline)
                        .foregroundStyle(QuietPalette.muted)
                        .padding(.top, 14)
                    Button("Retry sync") { Task { await model.refreshToday() } }
                        .font(.subheadline.weight(.medium))
                        .padding(.top, 8)
                }
                content
                NavigationLink {
                    GroceriesScreen(model: model)
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "basket")
                            .font(.title3)
                            .foregroundStyle(QuietPalette.accent)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Groceries").font(.headline).foregroundStyle(QuietPalette.ink)
                            Text(grocerySummary).font(.subheadline).foregroundStyle(QuietPalette.muted)
                        }
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(QuietPalette.muted)
                    }
                    .padding(18)
                    .frame(minHeight: 76)
                    .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
                }
                .buttonStyle(.plain)
                .padding(.top, 28)
                NavigationLink("Money") { MoneyScreen(session: model, member: member).id(model.generation) }
                    .frame(minHeight: 44)
                mealsShortcut
                NavigationLink("Calendar") { CalendarScreen(member: member, session: model).id(model.generation) }
                    .frame(minHeight: 44)
                    .padding(.top, 16)
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
        }
        .background(QuietPalette.background)
        .refreshable {
            await model.refreshToday()
            await model.refreshGroceries()
        }
        .task { if model.today == .idle { await model.refreshToday() } }
        .task { if model.groceries == .idle { await model.refreshGroceries() } }
    }

    private var mealsShortcut: some View {
        NavigationLink {
            MealWeekScreen(model: model)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "fork.knife")
                    .font(.title3).foregroundStyle(QuietPalette.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Meals").font(.headline).foregroundStyle(QuietPalette.ink)
                    Text("See your household week")
                        .font(.subheadline).foregroundStyle(QuietPalette.muted)
                }
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(QuietPalette.muted)
            }
            .padding(18)
            .frame(minHeight: 76)
            .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .padding(.top, 12)
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
    private var content: some View {
        switch model.today {
        case .idle, .loading:
            ProgressView("Loading chores…").padding(.top, 24)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("Could not load your chores. Try again online.")
                Button("Retry") { Task { await model.refreshToday() } }
            }
            .foregroundStyle(QuietPalette.muted)
            .padding(.top, 24)
        case .loaded(let state):
            let visible = state.chores.filter {
                everyone || $0.state == .pending || $0.state == .conflict
                    || $0.chore.assigneeId == nil || $0.chore.assigneeId == member.userId
            }
            if visible.isEmpty {
                Text("Nothing due in this view.")
                    .foregroundStyle(QuietPalette.muted)
                    .padding(.top, 24)
            } else {
                ForEach(visible) { chore in choreRow(chore) }
            }
        }
    }

    @ViewBuilder
    private func choreRow(_ item: LocalChore) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                Task { await model.complete(item.chore) }
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: item.state == .open ? "circle" : "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(QuietPalette.accent)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.chore.title).foregroundStyle(QuietPalette.ink)
                        Text(detail(item)).font(.caption).foregroundStyle(QuietPalette.muted)
                    }
                    Spacer()
                }
                .frame(minHeight: 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(item.state != .open)
            .accessibilityLabel(item.chore.title)
            .accessibilityValue(detail(item))
            if item.state == .conflict, let operation = item.operationId {
                Button("Discard saved change") { Task { await model.discard(operation) } }
                    .font(.caption.weight(.medium))
                    .padding(.leading, 38)
                    .padding(.bottom, 10)
            }
        }
        .overlay(alignment: .bottom) { QuietPalette.border.frame(height: 1) }
    }

    private func detail(_ item: LocalChore) -> String {
        let state =
            switch item.state {
            case .open: dueLabel(item.chore.dueDate)
            case .pending: "Saved · waiting to sync"
            case .completed: "Done"
            case .conflict: "Needs review · change was not applied"
            }
        return state
    }

    private func dueLabel(_ dueDate: CivilDate) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        if formatter.string(from: .now) == dueDate.value { return "Due today" }
        guard let date = formatter.date(from: dueDate.value) else { return "Due " + dueDate.value }
        let label = date.formatted(.dateTime.day().month(.abbreviated))
        return date < .now ? "Overdue since " + label : "Due " + label
    }
}
