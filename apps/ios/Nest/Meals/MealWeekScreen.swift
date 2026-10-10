import SwiftUI

enum MealRoute: Hashable {
    case groceries, library, food, cooking
}

struct MealWeekScreen: View {
    @ObservedObject var model: SessionModel
    @State private var replacementTarget: MealMoveTarget?
    @State private var leftoversTarget: MealMoveTarget?
    @State private var moveTarget: MealMoveTarget?
    @State private var addTarget: MealSlotTarget?
    @State private var removalCandidate: PlannedMeal?
    @State private var showingRemovalConfirmation = false
    @State private var showPast = false
    @State private var route: MealRoute?
    @State private var ingredientsPending = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if case .ready(let member) = model.status {
                    MealSetupPrompt(session: model, member: member).id(model.generation)
                }
                MealWeekHeader(
                    start: model.mealSelection, canGoBack: canMove(-1), canGoForward: canMove(1),
                    move: { offset in Task { await moveWeek(offset) } })
                MealWeekStatuses(model: model)
                content
                if let week = model.mealSelection, hasMeals || ingredientsPending {
                    NavigationLink {
                        IngredientReviewScreen(model: model, week: week).id(model.generation)
                    } label: {
                        TodayForYouRow(
                            icon: "checklist", domain: .groceries,
                            title: ingredientsPending ? "Finish adding ingredients" : "Review ingredients",
                            detail: ingredientsPending
                                ? "Your request is saved on this iPhone"
                                : "Untick what you have, add the rest to Groceries"
                        )
                        .nestCard(padding: 0, radius: 20)
                    }
                    .buttonStyle(NestPressStyle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 32)
        }
        .nestRootChrome("Meals", session: model, member: readyMember) { toolbarActions }
        .navigationDestination(item: $route) { destination($0) }
        .sheet(item: $addTarget) { MealAddSheet(model: model, target: $0) }
        .sheet(item: $replacementTarget) { MealReplacementSheet(model: model, target: $0) }
        .sheet(item: $leftoversTarget) { MealMoveSheet(model: model, target: $0, leftovers: true) }
        .sheet(item: $moveTarget) { MealMoveSheet(model: model, target: $0) }
        .confirmationDialog(
            "Remove meal?", isPresented: $showingRemovalConfirmation, presenting: removalCandidate
        ) { meal in
            Button("Remove \(meal.title)", role: .destructive) { Task { await model.removeMeal(meal) } }
        } message: { meal in
            Text(
                "\(meal.title) · \(MealWeekScreen.label(meal.date)) · \(meal.slot.label)\n\nThis meal will leave the shared week. Any linked preparation will be skipped."
            )
        }
        .refreshable {
            await model.refreshMealWeek()
            await model.refreshMealVisibleSlots()
        }
        .task(id: model.mealSelection) {
            ingredientsPending = false
            await checkPendingIngredients()
        }
        .onAppear { Task { await checkPendingIngredients() } }
        .task {
            await model.restorePreparationRecovery()
            if model.mealSelection == nil { await model.openCurrentMealWeek() }
            await model.refreshMealVisibleSlots()
        }
    }

    private var hasMeals: Bool {
        guard case .loaded(let snapshot) = model.mealStatus else { return false }
        return !snapshot.entries.isEmpty
    }

    /// A saved ingredient request keeps its way back even when the week has since emptied.
    private func checkPendingIngredients() async {
        guard let week = model.mealSelection else { return }
        let pending = (try? await model.ingredientReviewContext(week: week))?.saved?.pending != nil
        guard model.mealSelection == week else { return }
        ingredientsPending = pending
    }

    @ViewBuilder
    private var toolbarActions: some View {
        Button {
            route = .groceries
        } label: {
            Image(systemName: "basket")
        }
        .accessibilityLabel("Groceries")
        Menu {
            Button("Saved meals", systemImage: "book.closed") { route = .library }
            Button("Your food preferences", systemImage: "person.crop.circle") { route = .food }
            Button("Cooking preferences", systemImage: "slider.horizontal.3") { route = .cooking }
        } label: {
            Image(systemName: "ellipsis")
        }
        .accessibilityLabel("More meal options")
    }

    @ViewBuilder
    private func destination(_ route: MealRoute) -> some View {
        switch route {
        case .groceries: GroceriesScreen(model: model)
        case .library: MealLibraryScreen(model: model)
        case .food: FoodPreferencesScreen(model: model).id(model.generation)
        case .cooking: CookingPreferencesScreen(model: model)
        }
    }

    private var readyMember: VerifiedMember? {
        if case .ready(let member) = model.status { return member }
        return nil
    }

    @ViewBuilder
    private var content: some View {
        switch model.mealStatus {
        case .idle, .loading:
            ProgressView("Loading your week…").frame(maxWidth: .infinity, minHeight: 160)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("This week couldn’t load.").foregroundStyle(NestColor.ink)
                Button("Try again") { Task { await model.refreshMealWeek() } }
                    .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
            }
            .nestCard()
        case .loaded(let week):
            MealWeekDays(
                model: model, week: week, showPast: $showPast, canChange: canChange,
                add: { addTarget = $0 },
                remove: { meal in
                    removalCandidate = meal
                    showingRemovalConfirmation = true
                },
                replace: { replacementTarget = MealMoveTarget(source: week.weekStart, meal: $0) },
                leftovers: { leftoversTarget = MealMoveTarget(source: week.weekStart, meal: $0) },
                move: { moveTarget = MealMoveTarget(source: week.weekStart, meal: $0) })
        }
    }

    private var canChange: Bool {
        model.mealPlacement == nil && model.mealRemoval == nil && model.mealRecipePlacement == nil
            && model.mealMove == nil && model.mealReplacement == nil && model.mealRecipeReplacement == nil
            && model.mealLeftovers == nil
    }

    private func canMove(_ offset: Int) -> Bool {
        model.mealSelection.flatMap { try? $0.adjacent(offset) } != nil
    }

    private func moveWeek(_ offset: Int) async {
        guard let start = model.mealSelection, let adjacent = try? start.adjacent(offset) else { return }
        showPast = false
        await model.selectMealWeek(adjacent)
    }

    static func label(_ date: CivilDate) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = .current
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let value = formatter.date(from: date.value) else { return date.value }
        formatter.setLocalizedDateFormatFromTemplate("d MMM")
        return formatter.string(from: value)
    }
}

struct MealSlotTarget: Identifiable {
    let date: CivilDate
    let slot: MealSlot
    var id: String { "\(date.value):\(slot.rawValue)" }
}
