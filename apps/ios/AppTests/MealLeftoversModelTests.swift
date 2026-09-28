import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealLeftoversModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()
    private let start = try! MealWeekStart("2026-09-28")

    func testLostReplyRetriesSameMoveAndReconcilesBothWeeks() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let entry = await server.entry
        let next = try start.adjacent(1)
        let context = try await model.loadMealMove(source: start, target: next, entry: entry)
        await server.loseReply()
        let accepted = await model.placeMealLeftovers(context, date: next.date, slot: .lunch)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealLeftovers?.state, .pending)
        await model.retryMealLeftovers()
        XCTAssertNil(model.mealLeftovers)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let source) = model.mealStatus else { return XCTFail("Missing source") }
        XCTAssertEqual(source.entries.map(\.id), [entry])
        await model.selectMealWeek(next)
        guard case .loaded(let target) = model.mealStatus else { return XCTFail("Missing target") }
        XCTAssertEqual(target.entries.first?.leftoverSourceId, entry)
        XCTAssertNotEqual(target.entries.first?.id, entry)
        XCTAssertEqual(target.entries.first?.slot, .lunch)
    }

    func testContextFromPreviousAccountCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let next = try start.adjacent(1)
        let context = try await model.loadMealMove(source: start, target: next, entry: server.entry)
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.placeMealLeftovers(context, date: next.date, slot: .lunch)
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testRejectedMoveRemainsUntilExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let next = try start.adjacent(1)
        let context = try await model.loadMealMove(source: start, target: next, entry: server.entry)
        await server.reject()
        _ = await model.placeMealLeftovers(context, date: next.date, slot: .lunch)
        XCTAssertEqual(model.mealLeftovers?.state, .conflict)
        await model.retryMealLeftovers()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardConflictedMealLeftovers()
        XCTAssertNil(model.mealLeftovers)
    }

    private func fixture() throws -> (SessionModel, LeftoversTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = LeftoversTestServer(actor: actorA, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await server.respond($0)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "move-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return (
            SessionModel(
                auth: auth, chores: ChoreAPI(http: choreHTTP),
                offline: try ChoreOfflineStore(url: url), mealAPI: MealAPI(http: http)), server
        )
    }
}

actor LeftoversTestServer {
    let entry = UUID()
    let leftoverEntry = UUID()
    let actor: UUID
    let household: UUID
    var attempts: [UUID] = []
    private var moved: MoveMeal?
    private var lose = false
    private var rejected = false

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/meals/leftovers" {
            let command = try JSONDecoder().decode(MoveMeal.self, from: request.httpBody!)
            attempts.append(command.operationId)
            if rejected { return answer(request, "{\"error\":{\"code\":\"conflict\"}}", status: 409) }
            moved = command
            if lose {
                lose = false
                throw URLError(.networkConnectionLost)
            }
            let receipt = LeftoverPlacementReceipt(
                version: 1, actorId: actor, householdId: household,
                operationId: command.operationId, entryId: leftoverEntry, sourceEntryId: entry,
                sourceWeekStart: command.sourceWeekStart, targetWeekStart: command.targetWeekStart,
                sourceRevision: "1", targetRevision: "2", date: command.date, slot: command.slot)
            let json = String(decoding: try JSONEncoder().encode(receipt), as: UTF8.self)
            return answer(request, "{\"version\":1,\"receipt\":\(json)}")
        }
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
        let start = try MealWeekStart(query?.first(where: { $0.name == "weekStart" })?.value ?? "2026-09-28")
        let original = PlannedMeal(
            entryId: entry, date: try CivilDate("2026-09-28"), slot: .dinner,
            title: "Pasta", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        var entries = start.days.contains(original.date) ? [original] : []
        if let moved, start.days.contains(moved.date) {
            entries.append(
                PlannedMeal(
                    entryId: leftoverEntry, date: moved.date, slot: moved.slot,
                    title: "Pasta", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: entry))
        }
        let snapshot = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start,
            revision: moved?.targetWeekStart == start ? "2" : "1", entries: entries)
        return answer(request, String(decoding: try JSONEncoder().encode(snapshot), as: UTF8.self))
    }

    private func answer(_ request: URLRequest, _ body: String, status: Int = 200) -> (Data, URLResponse) {
        (
            Data(body.utf8),
            HTTPURLResponse(
                url: request.url!, statusCode: status,
                httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
