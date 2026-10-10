import Foundation

@testable import Nest

actor RecipeReplacementTestServer {
    let oldId = UUID()
    let newId = UUID()
    let recipeId = UUID()
    let ingredientId = UUID()
    let actor: UUID
    let household: UUID
    let start = try! MealWeekStart("2026-09-28")
    var attempts: [ReplaceSavedRecipe] = []
    private var selected: SavedRecipe?
    private var replaced: ReplaceSavedRecipe?
    private var libraryRevision = "4"
    private var originalRevision = "1"
    private var lose = false
    private var reject = false
    private var failRetained = false
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resumed: CheckedContinuation<Void, Never>?

    var recipe: SavedRecipe {
        SavedRecipe(
            definitionId: recipeId, title: "Saved soup", servings: 2, recipeUrl: nil, notes: "Recipe notes",
            instructions: libraryRevision == "4" ? "Simmer" : "Later library edit",
            ingredients: [
                SavedIngredient(
                    ingredientId: ingredientId, name: "Lentils", quantity: "100", unit: "g", categoryId: nil, note: nil,
                    order: 0)
            ])
    }

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func setLoss() { lose = true }
    func failRetainedRead() { failRetained = true }
    func rejectWrite() { reject = true }
    func changeRecipe() { libraryRevision = "5" }
    func changeWeek() { originalRevision = "2" }
    func pauseLibrary() { pause = true }
    func waitForLibrary() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseLibrary() {
        pause = false
        resumed?.resume()
        resumed = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        switch request.url?.path {
        case "/v1/meals/recipe/replace": return try replace(request)
        case "/v1/meals/library":
            if pause {
                waiting = true
                started?.resume()
                started = nil
                await withCheckedContinuation { resumed = $0 }
            }
            return try json(
                request,
                [
                    "version": 1, "householdId": household.uuidString, "revision": libraryRevision,
                    "meals": [["definitionId": recipeId.uuidString, "title": recipe.title, "servings": 2]],
                    "nextAfterId": NSNull(),
                ])
        case "/v1/meals/recipe":
            return try json(
                request,
                [
                    "version": 1, "householdId": household.uuidString,
                    "revision": libraryRevision,
                    "recipe": JSONSerialization.jsonObject(with: JSONEncoder().encode(recipe)),
                ])
        case "/v1/meals/planned-recipe":
            if failRetained {
                failRetained = false
                throw URLError(.networkConnectionLost)
            }
            let recipe = selected!
            let snapshot = PlannedRecipeSnapshot(
                libraryRevision: replaced?.expectedLibraryRevision,
                recipe: RetainedRecipe(
                    definitionId: recipe.id, title: recipe.title, servings: recipe.servings,
                    recipeUrl: recipe.recipeUrl, notes: recipe.notes, instructions: recipe.instructions,
                    ingredients: recipe.ingredients))
            return try encoded(
                request,
                PlannedRecipeEnvelope(
                    version: 1, householdId: household, weekStart: start,
                    revision: week.revision, entry: week.entries[0], snapshot: snapshot))
        case "/v1/meals/week": return try encoded(request, week)
        default: throw NestAPIFailure.invalid
        }
    }

    private var week: MealWeekSnapshot {
        let entry = PlannedMeal(
            entryId: replaced == nil ? oldId : newId, date: start.date, slot: .dinner,
            title: selected?.title ?? "Pasta", recipeUrl: selected?.recipeUrl, notes: selected?.notes,
            definitionId: selected?.id, leftoverSourceId: nil)
        return MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start,
            revision: replaced == nil ? originalRevision : "3", entries: [entry])
    }

    private func replace(_ request: URLRequest) throws -> (Data, URLResponse) {
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "X-Nest-Household") == household.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let command = try JSONDecoder().decode(ReplaceSavedRecipe.self, from: request.httpBody!)
        attempts.append(command)
        if reject { return try json(request, ["error": ["code": "conflict"]], status: 409) }
        if let replaced {
            guard replaced == command else { throw NestAPIFailure.invalid }
        } else {
            guard command.expectedLibraryRevision == libraryRevision, command.expectedRevision == originalRevision,
                command.entryId == oldId, command.definitionId == recipeId
            else { throw NestAPIFailure.conflict }
            replaced = command
            selected = recipe
        }
        if lose {
            lose = false
            throw URLError(.networkConnectionLost)
        }
        let receipt = MealRecipeReplacementReceipt(
            version: 1, actorId: actor, householdId: household,
            operationId: command.operationId, previousEntryId: oldId, entryId: newId, weekStart: start,
            date: start.date, slot: .dinner, revision: "3", definitionId: recipeId,
            libraryRevision: command.expectedLibraryRevision, skippedPreparationId: UUID())
        return try json(
            request, ["version": 1, "receipt": JSONSerialization.jsonObject(with: JSONEncoder().encode(receipt))])
    }

    private func encoded<T: Encodable>(_ request: URLRequest, _ value: T) throws -> (Data, URLResponse) {
        (
            try JSONEncoder().encode(value),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
    private func json(_ request: URLRequest, _ value: [String: Any], status: Int = 200) throws -> (Data, URLResponse) {
        (
            try JSONSerialization.data(withJSONObject: value),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        )
    }
}
