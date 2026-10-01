import Foundation

@testable import Nest

actor MealPreparationTestServer {
    let actor: UUID
    let partner: UUID
    let household: UUID
    nonisolated let target = PlannedRecipeTarget(start: try! MealWeekStart("2030-01-07"), id: UUID())
    let routine = UUID()
    let occurrence = UUID()
    var attempts: [MealPreparationCommand] = []
    private var savedReceipts: [UUID: MealPreparationReceipt] = [:]
    private var current: MealPreparation?
    private var revision = "1"
    private var lose = false
    private var rejected = false
    private var blockedReads = false
    private var blockAfterWrite = false
    private var paused = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resumed: CheckedContinuation<Void, Never>?

    init(actor: UUID, partner: UUID, household: UUID) {
        self.actor = actor
        self.partner = partner
        self.household = household
    }
    func loseNextReply() { lose = true }
    func rejectWrite() { rejected = true }
    func advanceWeek() { revision = "2" }
    func blockReadsAfterWrite() { blockAfterWrite = true }
    func allowReads() { blockedReads = false }
    func pauseNextWrite() { paused = true }
    func waitForWrite() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseWrite() {
        resumed?.resume()
        resumed = nil
        paused = false
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url!.path
        if path.hasSuffix("/create") || path.hasSuffix("/edit") {
            return try await write(request)
        }
        if blockedReads { throw URLError(.notConnectedToInternet) }
        if path == "/v1/routines/roster" {
            return try json(
                request,
                [
                    "version": 1, "householdId": household.uuidString,
                    "members": [
                        ["actorId": actor.uuidString, "displayName": "Alex"],
                        ["actorId": partner.uuidString, "displayName": "Sam"],
                    ],
                ])
        }
        if path == "/v1/meals/week" {
            return try json(
                request,
                [
                    "version": 1, "householdId": household.uuidString,
                    "weekStart": target.start.date.value, "revision": revision,
                    "entries": [
                        [
                            "entryId": target.id.uuidString, "date": "2030-01-07", "slot": "dinner", "title": "Soup",
                            "recipeUrl": NSNull(), "notes": NSNull(), "definitionId": NSNull(),
                            "leftoverSourceId": NSNull(),
                        ]
                    ],
                ])
        }
        guard path == "/v1/meals/preparation" else { throw NestAPIFailure.contract }
        let envelope = MealPreparationEnvelope(
            version: 1, householdId: household, weekStart: target.start,
            revision: revision, entryId: target.id,
            entry: .init(entryId: target.id, date: try CivilDate("2030-01-07"), title: "Soup"), preparation: current)
        return try encoded(request, envelope)
    }

    private func write(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let command: MealPreparationCommand
        if request.url!.path.hasSuffix("/create") {
            command = .create(try JSONDecoder().decode(CreateMealPreparation.self, from: request.httpBody!))
        } else {
            command = .edit(try JSONDecoder().decode(EditMealPreparation.self, from: request.httpBody!))
        }
        attempts.append(command)
        if rejected { return try json(request, ["error": ["code": "conflict"]], status: 409) }
        let receipt = try apply(command)
        if paused {
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resumed = $0 }
        }
        if lose {
            lose = false
            throw URLError(.networkConnectionLost)
        }
        blockedReads = blockAfterWrite
        return try encoded(request, WriteEnvelope(version: 1, receipt: receipt))
    }

    private func apply(_ command: MealPreparationCommand) throws -> MealPreparationReceipt {
        if let saved = savedReceipts[command.operationId] { return saved }
        let draft: MealPreparationDraft
        let version: String
        let previous: String?
        switch command {
        case .create(let value):
            draft = value.preparation
            version = "2030-01-07T12:00:00.000001Z"
            previous = nil
        case .edit(let value):
            let original = current!
            draft = MealPreparationDraft(
                title: value.patch.title ?? original.title,
                instructions: value.patch.instructions ?? original.instructions,
                dueOn: value.patch.dueOn ?? original.dueOn, assignment: value.patch.assignment ?? original.assignment)
            previous = value.expectedRoutineVersion
            version = "2030-01-07T12:00:00.000002Z"
        }
        current = MealPreparation(
            routineId: routine, occurrenceId: occurrence, routineVersion: version,
            title: draft.title, instructions: draft.instructions, dueOn: draft.dueOn, assignment: draft.assignment,
            plannedAssigneeId: nil, status: .open, state: .active)
        let receipt = MealPreparationReceipt(
            version: 1, actorId: actor, householdId: household,
            operationId: command.operationId, entryId: target.id, weekStart: target.start, revision: revision,
            routineId: routine, occurrenceId: occurrence, routineVersion: version, dueOn: draft.dueOn,
            previousRoutineVersion: previous)
        savedReceipts[command.operationId] = receipt
        return receipt
    }

    private struct WriteEnvelope: Encodable {
        let version: Int
        let receipt: MealPreparationReceipt
    }

    private func encoded<T: Encodable>(_ request: URLRequest, _ value: T) throws -> (Data, URLResponse) {
        (try JSONEncoder().encode(value), response(request, status: 200))
    }

    private func json(_ request: URLRequest, _ value: [String: Any], status: Int = 200) throws -> (Data, URLResponse) {
        (try JSONSerialization.data(withJSONObject: value), response(request, status: status))
    }

    private func response(_ request: URLRequest, status: Int) -> URLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
    }
}
