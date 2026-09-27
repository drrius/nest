import Foundation

@testable import Nest

actor FakePlannedRecipeServer {
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let entry = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    private let second = UUID(uuidString: "55555555-5555-4555-8555-555555555556")!
    private let definition = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    private var recorded: [String] = []
    private var offline = false
    private var removed = false
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    func paths() -> [String] { recorded }
    func setOffline(_ value: Bool) { offline = value }
    func removeEntry() { removed = true }
    func pauseFirstDetail() { pause = true }
    func waitForDetail() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseDetail() {
        resume?.resume()
        resume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        recorded.append(request.url!.path)
        if offline { throw URLError(.notConnectedToInternet) }
        let isA = request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A"
        let week = try week(isA: isA)
        if request.url?.path == "/v1/meals/week" { return try answer(request, body: week) }
        guard request.url?.path == "/v1/meals/planned-recipe" else { throw NestAPIFailure.invalid }
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let id = query.first { $0.name == "entryId" }?.value.flatMap(UUID.init(uuidString:))
        guard query.first(where: { $0.name == "revision" })?.value == week.revision else {
            throw NestAPIFailure.conflict
        }
        let selected = week.entries.first { $0.id == id }
        let recipe = selected.map {
            RetainedRecipe(
                definitionId: definition, title: $0.title, servings: 2,
                recipeUrl: nil, notes: nil, instructions: "Cook and serve.", ingredients: [])
        }
        let result = PlannedRecipeEnvelope(
            version: 1, householdId: household, weekStart: week.weekStart,
            revision: week.revision, entry: selected,
            snapshot: recipe.map { PlannedRecipeSnapshot(libraryRevision: "4", recipe: $0) })
        if isA && pause {
            pause = false
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resume = $0 }
        }
        return try answer(request, body: result)
    }

    private func week(isA: Bool) throws -> MealWeekSnapshot {
        let meals =
            removed
            ? []
            : [entry, second].enumerated().map { index, id in
                PlannedMeal(
                    entryId: id, date: try! CivilDate(index == 0 ? "2026-09-29" : "2026-09-30"),
                    slot: .dinner, title: isA ? "Original pasta" : "Sam soup", recipeUrl: nil, notes: nil,
                    definitionId: definition, leftoverSourceId: nil)
            }
        return MealWeekSnapshot(
            version: 1, householdId: household, weekStart: try MealWeekStart("2026-09-28"),
            revision: removed ? "2" : "1", entries: meals)
    }

    private func answer<T: Encodable>(_ request: URLRequest, body: T) throws -> (Data, URLResponse) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        return (try JSONEncoder().encode(body), response)
    }
}
