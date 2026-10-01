import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealRecipeReplacementModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()
    private let start = try! MealWeekStart("2026-09-28")

    func testLostReplyRetainsExactCommandAndOriginalRecipeAcrossLibraryEdit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let context = try await model.loadMealMove(source: start, target: start, entry: server.oldId)
        let recipe = await server.recipe
        await server.setLoss()
        let accepted = await model.replaceMealWithRecipe(context, recipe: recipe, libraryRevision: "4")
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealRecipeReplacement?.state, .pending)
        await server.changeRecipe()
        await model.retryMealRecipeReplacement()
        XCTAssertNil(model.mealRecipeReplacement)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let week) = model.mealStatus else { return XCTFail("Missing current week") }
        XCTAssertEqual(week.revision, "3")
        XCTAssertEqual(week.entries[0].title, recipe.title)
        XCTAssertEqual(week.entries[0].definitionId, recipe.id)
    }

    func testAcceptedWriteWithUnavailableRetainedReadOnlyRefreshes() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let context = try await model.loadMealMove(source: start, target: start, entry: server.oldId)
        await server.failRetainedRead()
        _ = await model.replaceMealWithRecipe(context, recipe: server.recipe, libraryRevision: "4")
        XCTAssertEqual(model.mealRecipeReplacement?.state, .acknowledged)
        await model.retryMealRecipeReplacement()
        XCTAssertNil(model.mealRecipeReplacement)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
    }

    func testStaleRecipeAndWeekDraftsDoNotEnqueueOrWrite() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let context = try await model.loadMealMove(source: start, target: start, entry: server.oldId)
        let recipe = await server.recipe
        await server.changeRecipe()
        let stale = await model.replaceMealWithRecipe(context, recipe: recipe, libraryRevision: "4")
        XCTAssertFalse(stale)
        XCTAssertNil(model.mealRecipeReplacement)
        await server.changeWeek()
        let staleWeek = await model.replaceMealWithRecipe(context, recipe: server.recipe, libraryRevision: "5")
        XCTAssertFalse(staleWeek)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testWriteConflictRequiresExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let context = try await model.loadMealMove(source: start, target: start, entry: server.oldId)
        await server.rejectWrite()
        _ = await model.replaceMealWithRecipe(context, recipe: server.recipe, libraryRevision: "4")
        XCTAssertEqual(model.mealRecipeReplacement?.state, .conflict)
        await model.retryMealRecipeReplacement()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardConflictedMealRecipeReplacement()
        XCTAssertNil(model.mealRecipeReplacement)
    }

    func testDelayedPreflightCannotWriteAfterAccountSwitch() async throws {
        let (model, server) = try fixture()
        await model.restore()
        await model.selectMealWeek(start)
        let context = try await model.loadMealMove(source: start, target: start, entry: server.oldId)
        let recipe = await server.recipe
        await server.pauseLibrary()
        let pending = Task { await model.replaceMealWithRecipe(context, recipe: recipe, libraryRevision: "4") }
        await server.waitForLibrary()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseLibrary()
        let accepted = await pending.value
        XCTAssertFalse(accepted)
        XCTAssertNil(model.mealRecipeReplacement)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
        XCTAssertEqual(model.status, .ready(VerifiedMember(userId: actorB, householdId: household, displayName: "Sam")))
    }

    private func fixture() throws -> (SessionModel, RecipeReplacementTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await chores.respond($0) }
        let server = RecipeReplacementTestServer(actor: actorA, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "saved-replacement-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return (
            SessionModel(
                auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
                mealAPI: MealAPI(http: http)), server
        )
    }
}
