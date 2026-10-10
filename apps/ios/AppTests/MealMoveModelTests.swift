import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealMoveModelTests: XCTestCase {
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
        let accepted = await model.moveMeal(context, date: next.date, slot: .lunch)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealMove?.state, .pending)
        await model.retryMealMove()
        XCTAssertNil(model.mealMove)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let source) = model.mealStatus else { return XCTFail("Missing source") }
        XCTAssertTrue(source.entries.isEmpty)
        await model.selectMealWeek(next)
        guard case .loaded(let target) = model.mealStatus else { return XCTFail("Missing target") }
        XCTAssertEqual(target.entries.map(\.id), [entry])
        XCTAssertEqual(target.entries.first?.slot, .lunch)
    }

    func testContextFromPreviousAccountCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let next = try start.adjacent(1)
        let context = try await model.loadMealMove(source: start, target: next, entry: server.entry)
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.moveMeal(context, date: next.date, slot: .lunch)
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
        _ = await model.moveMeal(context, date: next.date, slot: .lunch)
        XCTAssertEqual(model.mealMove?.state, .conflict)
        await model.retryMealMove()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardConflictedMealMove()
        XCTAssertNil(model.mealMove)
    }

    private func fixture() throws -> (SessionModel, MoveTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = MoveTestServer(actor: actorA, household: household)
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

actor MoveTestServer {
    let entry = UUID()
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
        if request.url?.path == "/v1/meals/move" {
            let command = try JSONDecoder().decode(MoveMeal.self, from: request.httpBody!)
            attempts.append(command.operationId)
            if rejected { return answer(request, "{\"error\":{\"code\":\"conflict\"}}", status: 409) }
            moved = command
            if lose {
                lose = false
                throw URLError(.networkConnectionLost)
            }
            let receipt = MealMoveReceipt(
                version: 1, actorId: actor, householdId: household,
                operationId: command.operationId, entryId: entry,
                sourceWeekStart: command.sourceWeekStart, targetWeekStart: command.targetWeekStart,
                sourceRevision: "2", targetRevision: "2", date: command.date, slot: command.slot)
            let json = String(decoding: try JSONEncoder().encode(receipt), as: UTF8.self)
            return answer(request, "{\"version\":1,\"receipt\":\(json)}")
        }
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
        let start = try MealWeekStart(query?.first(where: { $0.name == "weekStart" })?.value ?? "2026-09-28")
        let mealDate = moved?.date ?? (try! CivilDate("2026-09-28"))
        let meal = PlannedMeal(
            entryId: entry, date: mealDate, slot: moved?.slot ?? .dinner,
            title: "Pasta", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let snapshot = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start,
            revision: moved == nil ? "1" : "2", entries: start.days.contains(mealDate) ? [meal] : [])
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
