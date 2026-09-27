import Foundation

@testable import Nest

actor FakeMealServer {
    private let actorA: UUID
    private let actorB: UUID
    private let household: UUID
    private let entry = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    private var placed: PlaceMeal?
    private var placeAttempts: [UUID] = []
    private var removed: RemoveMeal?
    private var removeAttempts: [UUID] = []
    private var loseNextRemoveResponse = false
    private var rejectNextRemove = false
    private var loseNextPlaceResponse = false
    private var rejectNextPlace = false
    private var pauseA = false
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
    func pauseActorA() { pauseA = true }

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
        if request.url?.path == "/v1/cooking-preferences" {
            return answer(request, body: cooking(for: actor))
        }
        if actor == actorA && pauseA {
            aWaiting = true
            aStarted?.resume()
            aStarted = nil
            await withCheckedContinuation { aResume = $0 }
        }
        return answer(request, body: week(for: actor))
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

    private func week(for actor: UUID) -> String {
        let isA = actor == actorA
        let meal = isA && removed == nil ? placed : nil
        let row: String
        if let meal {
            row = entryRow(date: meal.date.value, slot: meal.slot.rawValue, title: meal.title)
        } else if !isA {
            row = entryRow(date: "2026-09-29", slot: "dinner", title: "Sam soup")
        } else {
            row = ""
        }
        let revision = isA ? (removed == nil ? (placed == nil ? "0" : "1") : "2") : "1"
        return """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(revision)","entries":[\(row)]}
            """
    }

    private func entryRow(date: String, slot: String, title: String) -> String {
        """
        {"entryId":"\(entry)","date":"\(date)","slot":"\(slot)","title":"\(title)","recipeUrl":null,"notes":null,"definitionId":null,"leftoverSourceId":null}
        """
    }

    private func cooking(for actor: UUID) -> String {
        let slots = actor == actorA ? "[\"lunch\",\"dinner\"]" : "[\"dinner\"]"
        return """
            {"version":1,"householdId":"\(household)","profile":{"revision":"1","preferences":{"cookingNotes":"","mealSlots":\(slots)}}}
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
