import Foundation

@testable import Nest

actor FakeMealServer {
    private let actorA: UUID
    private let actorB: UUID
    private let household: UUID
    private let entry = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    private let recipeId = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    private var placed: PlaceMeal?
    private var placeAttempts: [UUID] = []
    private var removed: RemoveMeal?
    private var removeAttempts: [UUID] = []
    private var loseNextRemoveResponse = false
    private var rejectNextRemove = false
    private var loseNextPlaceResponse = false
    private var rejectNextPlace = false
    private var pagedLibrary = false
    private var failLibrary = false
    private var libraryRevision = "4"
    private var recipeInstructions = "Cook and serve."
    private var forbidNextRecipeResponse = false
    private var pauseMembershipRead = false
    private var libraryQueries: [String] = []
    private var recipePlaced: PlaceSavedRecipe?
    private var recipeAttempts: [UUID] = []
    private var loseNextRecipeResponse = false
    private var rejectNextRecipe = false
    private var weekFailure: NestAPIFailure?
    func failWeeks(_ error: NestAPIFailure?) { weekFailure = error }
    private var pauseA = false
    private var pausedPath: String?
    private var aWaiting = false
    private var aStarted: CheckedContinuation<Void, Never>?
    private var aResume: CheckedContinuation<Void, Never>?

    init(actorA: UUID, actorB: UUID, household: UUID) {
        self.actorA = actorA
        self.actorB = actorB
        self.household = household
    }

    func loseNextPlace() { loseNextPlaceResponse = true }
    func rejectPlace() { rejectNextPlace = true }
    func operations() -> [UUID] { placeAttempts }
    func loseNextRemove() { loseNextRemoveResponse = true }
    func rejectRemove() { rejectNextRemove = true }
    func removalOperations() -> [UUID] { removeAttempts }
    func savedRecipeId() -> UUID { recipeId }
    func usePagedLibrary() { pagedLibrary = true }
    func failNextLibraryRead() { failLibrary = true }
    func queriedLibraryPages() -> [String] { libraryQueries }
    func loseNextRecipePlace() { loseNextRecipeResponse = true }
    func rejectRecipePlace() { rejectNextRecipe = true }
    func recipeOperations() -> [UUID] { recipeAttempts }
    func changeSavedRecipe() {
        libraryRevision = "5"
        recipeInstructions = "Updated cooking instructions."
    }
    func forbidNextRecipe() { forbidNextRecipeResponse = true }
    func pauseNextMembershipRead() { pauseMembershipRead = true }
    func pauseActorA() { pauseA = true }
    func pauseRecipeDetail() {
        pauseA = true
        pausedPath = "/v1/meals/recipe"
    }

    func waitForActorA() async {
        if aWaiting { return }
        await withCheckedContinuation { aStarted = $0 }
    }

    func releaseActorA() {
        pauseA = false
        aResume?.resume()
        aResume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
        let actor = token == "Bearer token-A" ? actorA : actorB
        if request.url?.path == "/v1/meals/place" { return try place(request, actor: actor) }
        if request.url?.path == "/v1/meals/remove" { return try remove(request, actor: actor) }
        if request.url?.path == "/v1/meals/recipe/place" {
            return try placeRecipe(request, actor: actor)
        }
        if request.url?.path == "/v1/cooking-preferences" {
            return answer(request, body: cooking(for: actor))
        }
        if request.url?.path == "/v1/meals/recipe", forbidNextRecipeResponse {
            forbidNextRecipeResponse = false
            return answer(request, body: "{\"error\":{\"code\":\"forbidden\"}}", status: 403)
        }
        if request.url?.path == "/v1/session" {
            if actor == actorA && pauseMembershipRead {
                pauseMembershipRead = false
                await suspendActorA()
            }
            let body =
                "{\"version\":1,\"member\":{\"userId\":\"\(actor)\",\"householdId\":\"\(household)\",\"displayName\":\"Test\"}}"
            return answer(request, body: body)
        }
        let capturedRecipe = request.url?.path == "/v1/meals/recipe" ? recipe(for: actor) : nil
        if actor == actorA && pauseA && (pausedPath == nil || request.url?.path == pausedPath) {
            await suspendActorA()
        }
        if request.url?.path == "/v1/meals/library" {
            return answer(request, body: try library(for: actor, request: request))
        }
        if let capturedRecipe {
            return answer(request, body: capturedRecipe)
        }
        if weekFailure == .forbidden {
            return answer(request, body: "{\"error\":{\"code\":\"forbidden\"}}", status: 403)
        }
        if let weekFailure { throw weekFailure }
        return answer(request, body: week(for: actor))
    }

    private func suspendActorA() async {
        aWaiting = true
        aStarted?.resume()
        aStarted = nil
        await withCheckedContinuation { aResume = $0 }
    }

    private func place(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(PlaceMeal.self, from: request.httpBody ?? Data())
        placeAttempts.append(command.operationId)
        if rejectNextPlace {
            rejectNextPlace = false
            return answer(request, body: "{\"error\":{\"code\":\"conflict\"}}", status: 409)
        }
        if let placed, placed != command { throw NestAPIFailure.invalid }
        placed = command
        if loseNextPlaceResponse {
            loseNextPlaceResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"receipt":{"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"\(command.weekStart.date.value)","date":"\(command.date.value)","slot":"\(command.slot.rawValue)","revision":"1"}}
            """
        return answer(request, body: body)
    }

    private func remove(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(RemoveMeal.self, from: request.httpBody ?? Data())
        removeAttempts.append(command.operationId)
        if rejectNextRemove {
            rejectNextRemove = false
            return answer(request, body: "{\"error\":{\"code\":\"conflict\"}}", status: 409)
        }
        guard command.entryId == entry, command.expectedRevision == "1", placed != nil else {
            throw NestAPIFailure.invalid
        }
        if let removed, removed != command { throw NestAPIFailure.invalid }
        removed = command
        if loseNextRemoveResponse {
            loseNextRemoveResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"receipt":{"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"\(command.weekStart.date.value)","revision":"2","removed":true,"skippedPreparationId":null}}
            """
        return answer(request, body: body)
    }

    private func placeRecipe(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(PlaceSavedRecipe.self, from: request.httpBody ?? Data())
        recipeAttempts.append(command.operationId)
        if rejectNextRecipe {
            rejectNextRecipe = false
            return answer(request, body: "{\"error\":{\"code\":\"conflict\"}}", status: 409)
        }
        guard command.definitionId == recipeId,
            command.expectedRevision == "0", command.expectedLibraryRevision == libraryRevision
        else { throw NestAPIFailure.invalid }
        if let recipePlaced, recipePlaced != command { throw NestAPIFailure.invalid }
        recipePlaced = command
        if loseNextRecipeResponse {
            loseNextRecipeResponse = false
            throw URLError(.networkConnectionLost)
        }
        let body = """
            {"version":1,"receipt":{"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"\(command.weekStart.date.value)","date":"\(command.date.value)","slot":"\(command.slot.rawValue)","revision":"1","definitionId":"\(recipeId)","libraryRevision":"\(libraryRevision)"}}
            """
        return answer(request, body: body)
    }

    private func week(for actor: UUID) -> String {
        let isA = actor == actorA
        let meal = isA && removed == nil ? placed : nil
        let row: String
        if isA, let recipePlaced {
            row = entryRow(
                date: recipePlaced.date.value, slot: recipePlaced.slot.rawValue,
                title: "Alex pasta", definition: recipeId)
        } else if let meal {
            row = entryRow(date: meal.date.value, slot: meal.slot.rawValue, title: meal.title)
        } else if !isA {
            row = entryRow(date: "2026-09-29", slot: "dinner", title: "Sam soup")
        } else {
            row = ""
        }
        let revision =
            isA
            ? (recipePlaced == nil ? (removed == nil ? (placed == nil ? "0" : "1") : "2") : "1")
            : "1"
        return """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(revision)","entries":[\(row)]}
            """
    }

    private func entryRow(
        date: String, slot: String, title: String, definition: UUID? = nil
    ) -> String {
        let definitionValue = definition.map { "\"\($0)\"" } ?? "null"
        return """
            {"entryId":"\(entry)","date":"\(date)","slot":"\(slot)","title":"\(title)","recipeUrl":null,"notes":null,"definitionId":\(definitionValue),"leftoverSourceId":null}
            """
    }

    private func cooking(for actor: UUID) -> String {
        let slots = actor == actorA ? "[\"lunch\",\"dinner\"]" : "[\"dinner\"]"
        return """
            {"version":1,"householdId":"\(household)","profile":{"revision":"1","preferences":{"cookingNotes":"","mealSlots":\(slots)}}}
            """
    }

    private func library(for actor: UUID, request: URLRequest) throws -> String {
        if failLibrary {
            failLibrary = false
            throw URLError(.networkConnectionLost)
        }
        libraryQueries.append(request.url?.query ?? "")
        if pagedLibrary && actor == actorA { return try page(request) }
        let title = actor == actorA ? "Alex pasta" : "Sam soup"
        return """
            {"version":1,"householdId":"\(household)","revision":"\(libraryRevision)","meals":[{"definitionId":"\(recipeId)","title":"\(title)","servings":2}],"nextAfterId":null}
            """
    }

    private func page(_ request: URLRequest) throws -> String {
        let cursor = String(format: "00000000-0000-4000-8000-%012d", 50).lowercased()
        let query = request.url?.query ?? ""
        guard query.isEmpty || query == "afterId=\(cursor)&expectedRevision=\(libraryRevision)"
        else { throw NestAPIFailure.invalid }
        let indexes = query.isEmpty ? Array(1...50) : [51]
        let rows = indexes.map { index in
            let id = String(format: "00000000-0000-4000-8000-%012d", index)
            return "{\"definitionId\":\"\(id)\",\"title\":\"Recipe \(index)\",\"servings\":2}"
        }.joined(separator: ",")
        let next = query.isEmpty ? "\"\(cursor)\"" : "null"
        return """
            {"version":1,"householdId":"\(household)","revision":"\(libraryRevision)","meals":[\(rows)],"nextAfterId":\(next)}
            """
    }

    private func recipe(for actor: UUID) -> String {
        let title = actor == actorA ? "Alex pasta" : "Sam soup"
        return """
            {"version":1,"householdId":"\(household)","revision":"\(libraryRevision)","recipe":{"definitionId":"\(recipeId)","title":"\(title)","servings":2,"recipeUrl":null,"notes":null,"instructions":"\(recipeInstructions)","ingredients":[]}}
            """
    }

    private func answer(
        _ request: URLRequest, body: String, status: Int = 200
    ) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (Data(body.utf8), response)
    }
}
