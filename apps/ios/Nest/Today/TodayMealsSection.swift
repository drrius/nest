import SwiftUI

struct TodayMealsSection: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let day: CivilDate
    let refresh: UUID
    @Environment(\.scenePhase) private var scenePhase
    @State private var result: TodayMealsRead?
    @State private var failed = false
    @State private var request = UUID()

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("On the menu").font(.headline).foregroundStyle(QuietPalette.ink)
            if let result {
                meals(result.week)
                if result.saved {
                    Text("Showing saved meals. Refresh when you’re online.")
                        .font(.caption).foregroundStyle(QuietPalette.muted)
                }
            } else if failed {
                Text("Could not load today’s meals.").foregroundStyle(QuietPalette.muted)
                Button("Try again") { Task { await load() } }.frame(minHeight: 44)
            } else {
                ProgressView("Loading meals…")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
        .task(id: refresh) { await load() }
        .onChange(of: day) { _, _ in Task { await load() } }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load() } }
        }
        .onDisappear { request = UUID() }
    }

    @ViewBuilder
    private func meals(_ week: MealWeekSnapshot) -> some View {
        let entries = MealSlot.allCases.flatMap { slot in
            week.entries.filter { $0.date == day && $0.slot == slot }
        }
        if entries.isEmpty {
            Text("Nothing planned for today.").foregroundStyle(QuietPalette.muted)
        }
        ForEach(entries) { meal in
            NavigationLink {
                PlannedRecipeScreen(
                    model: model, target: PlannedRecipeTarget(start: week.weekStart, id: meal.id))
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(meal.slot.label).font(.caption).foregroundStyle(QuietPalette.muted)
                        Text(meal.title).foregroundStyle(QuietPalette.ink)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(QuietPalette.muted)
                }
                .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
        }
        NavigationLink("Open meal plan") { MealWeekScreen(model: model) }
            .font(.subheadline.weight(.medium)).frame(minHeight: 44)
    }

    private func load() async {
        let current = UUID()
        request = current
        result = nil
        failed = false
        do {
            // Select the week containing this device's civil day, including while travelling.
            guard let date = day.localDay(timeZone: TimeZone(identifier: "Europe/Zurich")!) else {
                throw MealContractError.invalidWeek
            }
            let start = try MealWeekStart.current(now: date)
            let value = try await model.readTodayMeals(start, member: member)
            guard request == current, model.status == .ready(member) else { return }
            result = value
        } catch {
            guard request == current, model.status == .ready(member) else { return }
            failed = true
        }
    }
}
