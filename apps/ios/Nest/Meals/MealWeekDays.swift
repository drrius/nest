import SwiftUI

/// Seven days with the plan invite on top. On the current week, days before today fold into one row.
struct MealWeekDays: View {
    @ObservedObject var model: SessionModel
    let week: MealWeekSnapshot
    @Binding var showPast: Bool
    let canChange: Bool
    let add: (MealSlotTarget) -> Void
    let remove: (PlannedMeal) -> Void
    let replace: (PlannedMeal) -> Void
    let leftovers: (PlannedMeal) -> Void
    let move: (PlannedMeal) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let today = (try? TodayMoment(now: .now))?.day
        let days = week.weekStart.days
        let earlier = days.filter { today != nil && $0.value < today!.value }
        let pastWeek = !days.isEmpty && earlier.count == days.count
        let past = pastWeek ? [] : earlier
        let upcoming = days.filter { !past.contains($0) }
        VStack(alignment: .leading, spacing: 12) {
            if !pastWeek && openSlots(in: upcoming) > 0 {
                NavigationLink {
                    MealProposalScreen(model: model, week: week).id(model.generation)
                } label: {
                    MealPlanInvite(openSlots: openSlots(in: upcoming), totalSlots: upcoming.count * slots.count)
                }
                .buttonStyle(NestPressStyle())
            }
            if !past.isEmpty && !meals(on: past).isEmpty {
                MealPastDaysRow(days: past, meals: meals(on: past), expanded: $showPast)
                if showPast {
                    ForEach(past, id: \.value) { day($0, today: today) }
                        .transition(reduceMotion ? .opacity : .opacity.combined(with: .move(edge: .top)))
                }
            }
            ForEach(upcoming, id: \.value) { day($0, today: today) }
            if pastWeek || openSlots(in: upcoming) == 0 {
                // A full or past week still reaches planning, so an unfinished approval can always be recovered.
                NavigationLink {
                    MealProposalScreen(model: model, week: week).id(model.generation)
                } label: {
                    TodayForYouRow(
                        icon: "sparkles", domain: .meal, title: "Plan with Nest",
                        detail: "Review a plan or start a new one"
                    )
                    .nestCard(padding: 0, radius: 20)
                }
                .buttonStyle(NestPressStyle())
            }
        }
    }

    private var slots: [MealSlot] { model.mealVisibleSlots }

    private func meals(on days: [CivilDate]) -> [PlannedMeal] {
        week.entries.filter { days.contains($0.date) }
    }

    private func openSlots(in days: [CivilDate]) -> Int {
        days.reduce(0) { total, date in
            total + slots.filter { slot in !week.entries.contains { $0.date == date && $0.slot == slot } }.count
        }
    }

    private func day(_ date: CivilDate, today: CivilDate?) -> some View {
        MealDayView(
            date: date, meals: week.entries.filter { $0.date == date }, slots: slots, canChange: canChange,
            isToday: date == today,
            add: { slot in add(MealSlotTarget(date: date, slot: slot)) },
            remove: remove, replace: replace, leftovers: leftovers, move: move,
            detail: { meal in
                PlannedRecipeScreen(model: model, target: PlannedRecipeTarget(start: week.weekStart, id: meal.id))
            })
    }
}

/// Saved-but-unconfirmed meal changes and notices, shown above the week until they resolve.
struct MealWeekStatuses: View {
    @ObservedObject var model: SessionModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let notice = model.mealPreparationNotice { note(notice) }
            if let saved = model.mealPreparationRequest { MealPreparationStatus(model: model, saved: saved) }
            if let notice = model.mealNotice { note(notice) }
            if let notice = model.mealSlotNotice { note(notice) }
            if let saved = model.mealPlacement { MealPlacementStatus(model: model, saved: saved) }
            if let saved = model.mealRemoval { MealRemovalStatus(model: model, saved: saved) }
            if let saved = model.mealRecipePlacement { MealRecipePlacementStatus(model: model, saved: saved) }
            if let saved = model.mealLeftovers { MealLeftoversStatus(model: model, saved: saved) }
            if let saved = model.mealMove { MealMoveStatus(model: model, saved: saved) }
            if let saved = model.mealReplacement { MealReplacementStatus(model: model, saved: saved) }
            if let saved = model.mealRecipeReplacement { MealRecipeReplacementStatus(model: model, saved: saved) }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(NestColor.ink2)
            .padding(.horizontal, 14).padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(NestColor.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
