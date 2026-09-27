import Foundation
import XCTest

@testable import Nest

@MainActor
final class PlannedRecipeModelTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let start = try! MealWeekStart("2026-09-28")
    private let entry = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    private let second = UUID(uuidString: "55555555-5555-4555-8555-555555555556")!

    private func model(server: FakePlannedRecipeServer, url: URL? = nil) throws -> SessionModel {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await server.respond($0)
        }
        let file = url ?? FileManager.default.temporaryDirectory.appending(path: "planned-model-\(UUID()).sqlite")
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: file),
            mealAPI: MealAPI(http: mealHTTP))
    }

    func testRetainedRecipeNeverUsesTheCurrentLibraryAsFallback() async throws {
        let server = FakePlannedRecipeServer()
        let model = try model(server: server)
        await model.restore()
        await model.loadPlannedRecipe(PlannedRecipeTarget(start: start, id: entry))
        guard case .loaded(let detail) = model.plannedRecipe else { return XCTFail("Meal did not load") }
        XCTAssertEqual(detail.snapshot?.recipe.title, "Original pasta")
        XCTAssertEqual(detail.snapshot?.libraryRevision, "4")
        XCTAssertTrue(model.plannedRecipeFresh)
        let paths = await server.paths()
        XCTAssertEqual(paths, ["/v1/meals/week", "/v1/meals/planned-recipe"])
    }

    func testRestartShowsCachedRecipeAsStaleAndFreshRemovalReplacesIt() async throws {
        let server = FakePlannedRecipeServer()
        let url = FileManager.default.temporaryDirectory.appending(path: "planned-restart-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try model(server: server, url: url)
        await first.restore()
        let target = PlannedRecipeTarget(start: start, id: entry)
        await first.loadPlannedRecipe(target)
        await server.setOffline(true)
        let reopened = try model(server: server, url: url)
        await reopened.restore()
        await reopened.loadPlannedRecipe(target)
        guard case .loaded(let cached) = reopened.plannedRecipe else { return XCTFail("Saved recipe was lost") }
        XCTAssertEqual(cached.snapshot?.recipe.title, "Original pasta")
        XCTAssertFalse(reopened.plannedRecipeFresh)
        XCTAssertTrue(reopened.plannedRecipeNotice?.contains("Saved copy") == true)
        await server.setOffline(false)
        await server.removeEntry()
        await reopened.loadPlannedRecipe(target)
        guard case .loaded(let fresh) = reopened.plannedRecipe else { return XCTFail("Missing meal did not load") }
        XCTAssertNil(fresh.entry)
        XCTAssertNil(fresh.snapshot)
        XCTAssertTrue(reopened.plannedRecipeFresh)
        await server.setOffline(true)
        await reopened.loadPlannedRecipe(target)
        guard case .loaded(let missing) = reopened.plannedRecipe else { return XCTFail("Saved absence was lost") }
        XCTAssertNil(missing.entry)
        XCTAssertFalse(reopened.plannedRecipeFresh)
    }

    func testLateOldAccountReadCannotReplaceNewAccountDetail() async throws {
        let server = FakePlannedRecipeServer()
        let model = try model(server: server)
        await model.restore()
        await server.pauseFirstDetail()
        let target = PlannedRecipeTarget(start: start, id: entry)
        let old = Task { await model.loadPlannedRecipe(target) }
        await server.waitForDetail()
        await model.signIn(idToken: "B", nonce: "test")
        XCTAssertEqual(model.plannedRecipe, .idle)
        XCTAssertNil(model.plannedRecipeTarget)
        await model.loadPlannedRecipe(target)
        await server.releaseDetail()
        await old.value
        guard case .loaded(let detail) = model.plannedRecipe else { return XCTFail("New member did not load") }
        XCTAssertEqual(detail.snapshot?.recipe.title, "Sam soup")
        XCTAssertTrue(model.plannedRecipeFresh)
    }

    func testLatePreviousSelectionCannotReplaceTheNewMeal() async throws {
        let server = FakePlannedRecipeServer()
        let model = try model(server: server)
        await model.restore()
        await server.pauseFirstDetail()
        let old = Task { await model.loadPlannedRecipe(PlannedRecipeTarget(start: start, id: entry)) }
        await server.waitForDetail()
        let target = PlannedRecipeTarget(start: start, id: second)
        await model.loadPlannedRecipe(target)
        await server.releaseDetail()
        await old.value
        guard case .loaded(let detail) = model.plannedRecipe else { return XCTFail("New selection did not load") }
        XCTAssertEqual(detail.entry?.id, second)
        XCTAssertEqual(model.plannedRecipeTarget, target)
    }

    func testUncachedOfflineMealDoesNotShowPreviousRecipe() async throws {
        let server = FakePlannedRecipeServer()
        let model = try model(server: server)
        await model.restore()
        await model.loadPlannedRecipe(PlannedRecipeTarget(start: start, id: entry))
        await server.setOffline(true)
        let target = PlannedRecipeTarget(start: start, id: second)
        await model.loadPlannedRecipe(target)
        XCTAssertEqual(model.plannedRecipe, .failed)
        XCTAssertEqual(model.plannedRecipeTarget, target)
        XCTAssertFalse(model.plannedRecipeFresh)
    }
}
