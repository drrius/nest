import SwiftUI

struct MealWeekScreen: View {
    @ObservedObject var model: SessionModel
    @State private var replacementTarget: MealMoveTarget?
    @State private var leftoversTarget: MealMoveTarget?
    @State private var moveTarget: MealMoveTarget?
    @State private var addTarget: MealSlotTarget?
    @State private var removalCandidate: PlannedMeal?
    @State private var showingRemovalConfirmation = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if case .ready(let member) = model.status {
                    QuietTabHeader(
                        title: "Meals", subtitle: "Good food. One less daily decision.",
                        session: model, member: member)
                    MealSetupPrompt(session: model, member: member).id(model.generation)
                }
                weekNavigation
                if let notice = model.mealPreparationNotice { Text(notice).foregroundStyle(QuietPalette.muted) }
                if let saved = model.mealPreparationRequest { MealPreparationStatus(model: model, saved: saved) }
                if let notice = model.mealNotice {
                    Text(notice).font(.subheadline).foregroundStyle(QuietPalette.muted)
                }
                if let notice = model.mealSlotNotice {
                    Text(notice).font(.caption).foregroundStyle(QuietPalette.muted)
                }
                if let saved = model.mealPlacement {
                    MealPlacementStatus(model: model, saved: saved)
                }
                if let saved = model.mealRemoval {
                    MealRemovalStatus(model: model, saved: saved)
                }
                if let saved = model.mealRecipePlacement {
                    MealRecipePlacementStatus(model: model, saved: saved)
                }
                if let saved = model.mealLeftovers {
                    MealLeftoversStatus(model: model, saved: saved)
                }
                if let saved = model.mealMove {
                    MealMoveStatus(model: model, saved: saved)
                }
                if let saved = model.mealReplacement {
                    MealReplacementStatus(model: model, saved: saved)
                }
                if let saved = model.mealRecipeReplacement {
                    MealRecipeReplacementStatus(model: model, saved: saved)
                }
                if case .loaded(let week) = model.mealStatus {
                    NavigationLink {
                        MealProposalScreen(model: model, week: week).id(model.generation)
                    } label: {
                        Label("Plan the week with AI", systemImage: "sparkles")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .padding(.horizontal, 16)
                            .foregroundStyle(QuietPalette.onAccent)
                            .background(QuietPalette.accent, in: RoundedRectangle(cornerRadius: 16))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(QuietPalette.accent)
                }
                content
                if let week = model.mealSelection {
                    NavigationLink {
                        IngredientReviewScreen(model: model, week: week)
                            .id(model.generation)
                    } label: {
                        Label("Review ingredients", systemImage: "checklist")
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(QuietPalette.accent)
                }
                NavigationLink {
                    FoodPreferencesScreen(model: model).id(model.generation)
                } label: {
                    Label("Your food preferences", systemImage: "person.crop.circle")
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                }
                .buttonStyle(.plain)
                .foregroundStyle(QuietPalette.accent)
                NavigationLink {
                    CookingPreferencesScreen(model: model)
                } label: {
                    Label("Cooking preferences", systemImage: "slider.horizontal.3")
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                }
                .buttonStyle(.plain)
                .foregroundStyle(QuietPalette.accent)
                NavigationLink {
                    MealLibraryScreen(model: model)
                } label: {
                    Label("Saved meals", systemImage: "book.closed")
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                }
                .buttonStyle(.plain)
                .foregroundStyle(QuietPalette.accent)
                NavigationLink {
                    GroceriesScreen(model: model)
                } label: {
                    Label("Groceries", systemImage: "basket")
                        .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                }
                .buttonStyle(.plain)
                .foregroundStyle(QuietPalette.accent)
            }
            .padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $addTarget) { target in
            MealAddSheet(model: model, target: target)
        }
        .sheet(item: $replacementTarget) { target in
            MealReplacementSheet(model: model, target: target)
        }
        .sheet(item: $leftoversTarget) { target in
            MealMoveSheet(model: model, target: target, leftovers: true)
        }
        .sheet(item: $moveTarget) { target in
            MealMoveSheet(model: model, target: target)
        }
        .confirmationDialog(
            "Remove meal?", isPresented: $showingRemovalConfirmation,
            presenting: removalCandidate
        ) { meal in
            Button("Remove \(meal.title)", role: .destructive) {
                Task { await model.removeMeal(meal) }
            }
        } message: { meal in
            Text(
                "\(meal.title) · \(MealWeekScreen.label(meal.date)) · \(meal.slot.label)\n\nThis meal will leave the shared week. Any linked preparation will be skipped."
            )
        }
        .refreshable {
            await model.refreshMealWeek()
            await model.refreshMealVisibleSlots()
        }
        .task {
            await model.restorePreparationRecovery()
            if model.mealSelection == nil { await model.openCurrentMealWeek() }
            await model.refreshMealVisibleSlots()
        }
    }

    private var weekNavigation: some View {
        HStack(spacing: 12) {
            Button {
                Task { await moveWeek(-1) }
            } label: {
                Image(systemName: "chevron.left").frame(width: 44, height: 44)
            }
            .accessibilityLabel("Previous week")
            .disabled(model.mealSelection.flatMap { try? $0.adjacent(-1) } == nil)
            Spacer()
            if let start = model.mealSelection {
                Text(weekTitle(start)).font(.headline).foregroundStyle(QuietPalette.ink)
            } else {
                Text("This week").font(.headline).foregroundStyle(QuietPalette.ink)
            }
            Spacer()
            Button {
                Task { await moveWeek(1) }
            } label: {
                Image(systemName: "chevron.right").frame(width: 44, height: 44)
            }
            .accessibilityLabel("Next week")
            .disabled(model.mealSelection.flatMap { try? $0.adjacent(1) } == nil)
        }
        .foregroundStyle(QuietPalette.accent)
    }

    @ViewBuilder
    private var content: some View {
        switch model.mealStatus {
        case .idle, .loading:
            ProgressView("Loading your week…").frame(maxWidth: .infinity, minHeight: 120)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("This week could not load.").foregroundStyle(QuietPalette.muted)
                Button("Try again") { Task { await model.refreshMealWeek() } }
            }
        case .loaded(let week):
            ForEach(week.weekStart.days, id: \.value) { date in
                MealDayView(
                    date: date, meals: week.entries.filter { $0.date == date },
                    slots: model.mealVisibleSlots,
                    canChange: model.mealPlacement == nil && model.mealRemoval == nil
                        && model.mealRecipePlacement == nil && model.mealMove == nil && model.mealReplacement == nil
                        && model.mealRecipeReplacement == nil
                        && model.mealLeftovers == nil
                ) { slot in
                    addTarget = MealSlotTarget(date: date, slot: slot)
                } remove: { meal in
                    removalCandidate = meal
                    showingRemovalConfirmation = true
                } replace: { meal in
                    replacementTarget = MealMoveTarget(source: week.weekStart, meal: meal)
                } leftovers: { meal in
                    leftoversTarget = MealMoveTarget(source: week.weekStart, meal: meal)
                } move: { meal in
                    moveTarget = MealMoveTarget(source: week.weekStart, meal: meal)
                } detail: { meal in
                    PlannedRecipeScreen(
                        model: model,
                        target: PlannedRecipeTarget(start: week.weekStart, id: meal.id))
                }
            }
        }
    }

    private func moveWeek(_ offset: Int) async {
        guard let start = model.mealSelection,
            let adjacent = try? start.adjacent(offset)
        else { return }
        await model.selectMealWeek(adjacent)
    }

    private func weekTitle(_ start: MealWeekStart) -> String {
        guard let last = start.days.last else { return start.date.value }
        return "\(Self.label(start.date)) – \(Self.label(last))"
    }

    static func label(_ date: CivilDate) -> String {
        let parts = date.value.split(separator: "-")
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = .current
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let value = formatter.date(from: date.value) else { return date.value }
        formatter.dateFormat = "d MMM"
        return parts.count == 3 ? formatter.string(from: value) : date.value
    }
}

struct MealSlotTarget: Identifiable {
    let date: CivilDate
    let slot: MealSlot
    var id: String { "\(date.value):\(slot.rawValue)" }
}
