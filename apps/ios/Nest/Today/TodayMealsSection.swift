import SwiftUI

struct TodayMealsSection: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let day: CivilDate
    let refresh: UUID
    @Environment(\.scenePhase) private var scenePhase
    @State private var result: TodayMealsRead?
    @State private var failed = false
    @State private var loading = false
    @State private var request = UUID()

    @Environment(\.switchTab) private var switchTab

    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            NestSectionHeader(title: "On the menu")
            VStack(alignment: .leading, spacing: 0) {
                if let result {
                    meals(result.week)
                    if loading || result.saved {
                        Text(loading ? "Showing saved meals while refreshing…" : "Showing saved meals")
                            .font(.caption).foregroundStyle(NestColor.ink3)
                            .padding(.horizontal, 16).padding(.bottom, 12)
                    }
                    if failed { retry }
                } else if failed {
                    Text("Couldn’t load today’s meals.").foregroundStyle(NestColor.ink)
                        .padding(.horizontal, 16).padding(.top, 16)
                    retry
                } else {
                    HStack(spacing: 14) {
                        RoundedRectangle(cornerRadius: 16).fill(NestColor.fill2).frame(width: 56, height: 56)
                        RoundedRectangle(cornerRadius: 6).fill(NestColor.fill2).frame(width: 160, height: 16)
                    }
                    .padding(16)
                    .accessibilityLabel("Loading meals")
                }
            }
            .nestCard(padding: 0)
        }
        .tint(NestColor.accent)
        .task(id: refresh) { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load() } }
        }
        .onDisappear { request = UUID() }
    }

    private var retry: some View {
        Button("Try again") { Task { await load() } }
            .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
            .disabled(loading)
            .padding(16)
    }

    @ViewBuilder
    private func meals(_ week: MealWeekSnapshot) -> some View {
        let entries = MealSlot.allCases.flatMap { slot in
            week.entries.filter { $0.date == day && $0.slot == slot }
        }
        ForEach(Array(entries.enumerated()), id: \.element.id) { index, meal in
            if index > 0 { NestRowDivider(leading: 86) }
            NavigationLink {
                PlannedRecipeScreen(
                    model: model, target: PlannedRecipeTarget(start: week.weekStart, id: meal.id))
            } label: {
                HStack(spacing: 14) {
                    EmojiTile(emoji: MealEmoji.emoji(for: meal.title), size: 56)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(meal.slot.label.uppercased())
                            .font(.caption2.weight(.bold)).tracking(0.4).foregroundStyle(NestColor.tint(.meal))
                        Text(meal.title).font(.title3.weight(.semibold)).foregroundStyle(NestColor.ink)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                        .foregroundStyle(NestColor.ink3).accessibilityHidden(true)
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .contentShape(Rectangle())
            }
            .buttonStyle(NestPressStyle())
        }
        if !entries.isEmpty { NestRowDivider(leading: 16) }
        Button {
            switchTab(.meals)
        } label: {
            let layout =
                textSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                Image(systemName: entries.isEmpty ? "plus" : "calendar")
                    .font(.body.weight(.semibold)).foregroundStyle(NestColor.accentInk)
                    .frame(width: 30)
                Text(entries.isEmpty ? "Nothing planned yet" : "This week’s meals")
                    .foregroundStyle(NestColor.ink2)
                if !textSize.isAccessibilitySize { Spacer() }
                Text(entries.isEmpty ? "Plan" : "Open").fontWeight(.semibold).foregroundStyle(NestColor.accentInk)
            }
            .font(.subheadline)
            .padding(.horizontal, 16)
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
        .accessibilityLabel("Open meal plan")
    }

    private func load() async {
        let current = UUID()
        request = current
        failed = false
        loading = true
        defer { if request == current { loading = false } }
        do {
            // Select the week containing this device's civil day, including while travelling.
            guard let date = day.localDay(timeZone: TimeZone(identifier: "Europe/Zurich")!) else {
                throw MealContractError.invalidWeek
            }
            let start = try MealWeekStart.current(now: date)
            if result == nil {
                let cached = try? await model.cachedTodayMeals(start, member: member, generation: model.generation)
                guard request == current, model.status == .ready(member) else { return }
                result = cached
            }
            let value = try await model.readTodayMeals(start, member: member)
            guard request == current, model.status == .ready(member) else { return }
            result = value
        } catch {
            guard request == current, model.status == .ready(member) else { return }
            presentFailure(error)
        }
    }

    private func presentFailure(_ error: Error) {
        if (error as? NestAPIFailure) != .unavailable && !(error is URLError) { result = nil }
        result = result.map { TodayMealsRead(week: $0.week, saved: true) }
        failed = true
    }
}
