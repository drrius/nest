import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealReadDenialRaceTests: XCTestCase {
    func testMutationPreflightCannotAcceptHeldReplyAfterDenial() async throws {
        let fixture = try Fixture()
        let model = fixture.model
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        let generation = model.generation
        await fixture.held.holdNextWeek()
        let old = Task {
            try await model.requireMealWeekOnline(
                start: fixture.start, revision: "0", member: member, attempt: generation)
        }
        await fixture.held.waitForReply()
        await fixture.server.failWeeks(.forbidden)
        do {
            _ = try await model.readTodayMeals(fixture.start, member: member)
            XCTFail("Denied week succeeded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        await fixture.held.release()
        do {
            _ = try await old.value
            XCTFail("Mutation preflight accepted an old reply after denial")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
    }

    func testProposalWeekReadCannotAcceptHeldReplyAfterDenial() async throws {
        let fixture = try Fixture()
        let model = fixture.model
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        let context = try await model.cachedProposalContext()
        await fixture.held.holdNextWeek()
        let old = Task { try await model.freshProposalWeek(fixture.start, context: context) }
        await fixture.held.waitForReply()
        await fixture.server.failWeeks(.forbidden)
        do {
            _ = try await model.readTodayMeals(fixture.start, member: member)
            XCTFail("Denied week succeeded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        await fixture.held.release()
        do {
            _ = try await old.value
            XCTFail("Proposal accepted the old authorized reply after denial")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
    }

    func testOlderSuccessfulMealsReplyCannotRestoreWeekAfterTodayDenial() async throws {
        let fixture = try Fixture()
        let model = fixture.model
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        await model.selectMealWeek(fixture.start)
        await fixture.held.holdNextWeek()
        let old = Task { await model.refreshMealWeek() }
        await fixture.held.waitForReply()
        await fixture.server.failWeeks(.forbidden)
        do {
            _ = try await model.readTodayMeals(fixture.start, member: member)
            XCTFail("Denied read succeeded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        await fixture.held.release()
        await old.value
        XCTAssertEqual(model.mealStatus, .failed)
        let cached = try await model.cachedTodayMeals(
            fixture.start, member: member, generation: model.generation)
        XCTAssertNil(cached)
    }

    func testOlderSuccessfulTodayReplyCannotRestoreWeekAfterMealsDenial() async throws {
        let fixture = try Fixture()
        let model = fixture.model
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        await model.selectMealWeek(fixture.start)
        await fixture.held.holdNextWeek()
        let old = Task { try await model.readTodayMeals(fixture.start, member: member) }
        await fixture.held.waitForReply()
        await fixture.server.failWeeks(.forbidden)
        await model.refreshMealWeek()
        XCTAssertEqual(model.mealStatus, .failed)
        await fixture.held.release()
        do {
            _ = try await old.value
            XCTFail("Old successful reply restored a denied week")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cached = try await model.cachedTodayMeals(
            fixture.start, member: member, generation: model.generation)
        XCTAssertNil(cached)
    }
}

private struct Fixture {
    let start = try! MealWeekStart("2026-09-28")
    let server: FakeMealServer
    let held: HeldMealReply
    let model: SessionModel

    @MainActor init() throws {
        let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let server = FakeMealServer(actorA: actor, actorB: partner, household: household)
        let held = HeldMealReply(server: server)
        self.server = server
        self.held = held
        let auth = FakeAuthentication(active: AuthenticatedSession(userId: actor, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await chores.respond(request)
        }
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await held.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-read-race-\(UUID()).sqlite")
        model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: mealHTTP))
    }
}

private actor HeldMealReply {
    let server: FakeMealServer
    private var holdingNext = false
    private var waiting = false
    private var observed: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    init(server: FakeMealServer) { self.server = server }
    func holdNextWeek() { holdingNext = true }
    func waitForReply() async {
        if waiting { return }
        await withCheckedContinuation { observed = $0 }
    }
    func release() {
        resume?.resume()
        resume = nil
    }
    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let hold = holdingNext && request.url?.path == "/v1/meals/week"
        if hold { holdingNext = false }
        let reply = try await server.respond(request)
        if hold {
            waiting = true
            observed?.resume()
            observed = nil
            await withCheckedContinuation { resume = $0 }
        }
        return reply
    }
}
