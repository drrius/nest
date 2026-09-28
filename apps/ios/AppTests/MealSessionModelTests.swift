import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealSessionModelTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let start = try! MealWeekStart("2026-09-28")

    private func model(server: FakeMealServer) throws -> SessionModel {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await chores.respond(request)
        }
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await server.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-model-\(UUID()).sqlite")
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: mealHTTP))
    }

    func testTodayReadPreservesMealNavigationAndDistinguishesOfflineFromForbidden() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        let browsing = try start.adjacent(1)
        model.mealSelection = browsing
        model.mealStatus = .failed
        let live = try await model.readTodayMeals(start, member: member)
        XCTAssertFalse(live.saved)
        XCTAssertEqual(model.mealSelection, browsing)
        XCTAssertEqual(model.mealStatus, .failed)
        await server.failWeeks(.unavailable)
        let saved = try await model.readTodayMeals(start, member: member)
        XCTAssertTrue(saved.saved)
        XCTAssertEqual(saved.week, live.week)
        await server.failWeeks(.forbidden)
        do {
            _ = try await model.readTodayMeals(start, member: member)
            XCTFail("Forbidden read exposed cached meals")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
    }

    func testLateTodayReadCannotExposePreviousAccountMeals() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        await server.pauseActorA()
        let old = Task { try await model.readTodayMeals(start, member: member) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseActorA()
        do {
            _ = try await old.value
            XCTFail("Old account returned meals")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }

    func testLostPlacementResponseRetriesExactOperationAndShowsOneMeal() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        await server.loseNextPlace()
        let accepted = await model.placeMeal(
            date: try CivilDate("2026-09-29"), slot: .dinner, title: "Pasta")
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealPlacement?.state, .pending)
        let first = await server.operations()
        XCTAssertEqual(first.count, 1)
        await model.retryMealPlacement()
        let attempts = await server.operations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.mealPlacement)
        guard case .loaded(let week) = model.mealStatus else { return XCTFail("Week did not refresh") }
        XCTAssertEqual(week.entries.map(\.title), ["Pasta"])
    }

    func testRejectedPlacementNeedsExplicitDiscard() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        await server.rejectPlace()
        await model.placeMeal(date: try CivilDate("2026-09-29"), slot: .dinner, title: "Pasta")
        XCTAssertEqual(model.mealPlacement?.state, .conflict)
        await model.refreshMealWeek()
        XCTAssertEqual(model.mealPlacement?.state, .conflict)
        await model.discardConflictedMealPlacement()
        XCTAssertNil(model.mealPlacement)
    }

    func testLostRemovalResponseRetriesExactOperationAndShowsAbsence() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        _ = await model.placeMeal(
            date: try CivilDate("2026-09-29"), slot: .dinner, title: "Pasta")
        guard case .loaded(let before) = model.mealStatus,
            let meal = before.entries.first
        else { return XCTFail("Placed meal did not load") }
        await server.loseNextRemove()
        await model.removeMeal(meal)
        XCTAssertEqual(model.mealRemoval?.state, .pending)
        await model.removeMeal(meal)
        let first = await server.removalOperations()
        XCTAssertEqual(first.count, 1)
        await model.retryMealRemoval()
        let attempts = await server.removalOperations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.mealRemoval)
        guard case .loaded(let after) = model.mealStatus
        else { return XCTFail("Removed week did not refresh") }
        XCTAssertTrue(after.entries.isEmpty)
        XCTAssertEqual(after.revision, "2")
    }

    func testRejectedRemovalNeedsExplicitDiscard() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        _ = await model.placeMeal(
            date: try CivilDate("2026-09-29"), slot: .dinner, title: "Pasta")
        guard case .loaded(let week) = model.mealStatus,
            let meal = week.entries.first
        else { return XCTFail("Placed meal did not load") }
        await server.rejectRemove()
        await model.removeMeal(meal)
        XCTAssertEqual(model.mealRemoval?.state, .conflict)
        await model.refreshMealWeek()
        XCTAssertEqual(model.mealRemoval?.state, .conflict)
        await model.discardConflictedMealRemoval()
        XCTAssertNil(model.mealRemoval)
        guard case .loaded(let after) = model.mealStatus
        else { return XCTFail("Week did not refresh") }
        XCTAssertEqual(after.entries.count, 1)
    }

    func testOldAccountWeekReadCannotReplaceNewAccount() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await server.pauseActorA()
        let old = Task { await model.selectMealWeek(start) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.selectMealWeek(start)
        await server.releaseActorA()
        await old.value
        guard case .loaded(let week) = model.mealStatus else { return XCTFail("B week did not load") }
        XCTAssertEqual(week.entries.map(\.title), ["Sam soup"])
    }

    func testVisibleSlotsResetAtAccountSwitchAndReadHouseholdChoice() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealVisibleSlots()
        XCTAssertEqual(model.mealVisibleSlots, [.lunch, .dinner])
        await model.signIn(idToken: "B", nonce: "test")
        XCTAssertEqual(model.mealVisibleSlots, MealSlot.allCases)
        await model.refreshMealVisibleSlots()
        XCTAssertEqual(model.mealVisibleSlots, [.dinner])
    }

    func testInvalidTitleDoesNotQueueAPlacement() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        let accepted = await model.placeMeal(
            date: try CivilDate("2026-09-29"), slot: .dinner,
            title: String(repeating: "A", count: 121))
        XCTAssertFalse(accepted)
        XCTAssertNil(model.mealPlacement)
        let operations = await server.operations()
        XCTAssertTrue(operations.isEmpty)
    }
}
