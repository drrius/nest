import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealReplacementModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()
    private let start = try! MealWeekStart("2026-09-28")

    func testLostReplyRetriesSameReplacementAndShowsNewEntry() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let entry = await server.entry
        let next = start
        let context = try await model.loadMealMove(source: start, target: next, entry: entry)
        await server.loseReply()
        let accepted = await model.replaceMeal(context, title: "Soup")
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealReplacement?.state, .pending)
        await model.retryMealReplacement()
        XCTAssertNil(model.mealReplacement)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let week) = model.mealStatus else { return XCTFail("Missing week") }
        XCTAssertEqual(week.entries.map(\.title), ["Soup"])
        XCTAssertFalse(week.entries.contains { $0.id == entry })

    }

    func testContextFromPreviousAccountCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let next = start
        let context = try await model.loadMealMove(source: start, target: next, entry: server.entry)
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.replaceMeal(context, title: "Soup")
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testRejectedReplacementRemainsUntilExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let next = start
        let context = try await model.loadMealMove(source: start, target: next, entry: server.entry)
        await server.reject()
        _ = await model.replaceMeal(context, title: "Soup")
        XCTAssertEqual(model.mealReplacement?.state, .conflict)
        await model.retryMealReplacement()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardConflictedMealReplacement()
        XCTAssertNil(model.mealReplacement)
    }

    private func fixture() throws -> (SessionModel, ReplacementTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = ReplacementTestServer(actor: actorA, household: household)
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

actor ReplacementTestServer {
    let entry = UUID()
    let replacementEntry = UUID()
    let actor: UUID
    let household: UUID
    var attempts: [UUID] = []
    private var moved: ReplaceMeal?
    private var lose = false
    private var rejected = false

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/meals/replace" {
            let command = try JSONDecoder().decode(ReplaceMeal.self, from: request.httpBody!)
            attempts.append(command.operationId)
            if rejected { return answer(request, "{\"error\":{\"code\":\"conflict\"}}", status: 409) }
            moved = command
            if lose {
                lose = false
                throw URLError(.networkConnectionLost)
            }
            let receipt = MealReplacementReceipt(
                version: 1, actorId: actor, householdId: household,
                operationId: command.operationId, previousEntryId: entry, entryId: replacementEntry,
                weekStart: command.weekStart, date: command.date, slot: command.slot,
                revision: "3", skippedPreparationId: nil)
            let json = String(decoding: try JSONEncoder().encode(receipt), as: UTF8.self)
            return answer(request, "{\"version\":1,\"receipt\":\(json)}")
        }
        let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
        let start = try MealWeekStart(query?.first(where: { $0.name == "weekStart" })?.value ?? "2026-09-28")
        let mealDate = moved?.date ?? (try! CivilDate("2026-09-28"))
        let meal = PlannedMeal(
            entryId: moved == nil ? entry : replacementEntry, date: mealDate, slot: moved?.slot ?? .dinner,
            title: moved?.title ?? "Pasta", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let snapshot = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start,
            revision: moved == nil ? "1" : "3", entries: start.days.contains(mealDate) ? [meal] : [])
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
