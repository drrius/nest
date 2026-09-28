import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealLibraryModelTests: XCTestCase {
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
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-library-\(UUID()).sqlite")
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: mealHTTP))
    }

    func testLateIngredientWeekReadRejectsOldAccountContext() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        let context = try await model.ingredientReviewContext(week: start)
        await server.pauseActorA()
        let read = Task { try await model.refreshIngredientReview(context) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseActorA()
        do {
            _ = try await read.value
            XCTFail("Returned an old-account ingredient review")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let current = try await model.ingredientReviewContext(week: start)
        XCTAssertEqual(current.member.userId, actorB)
        XCTAssertNil(current.saved)
    }

    func testLibraryAndRecipeResetOnAccountSwitch() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        guard case .loaded(let listing) = model.mealLibrary else {
            return XCTFail("Library did not load")
        }
        XCTAssertEqual(listing.meals.map(\.title), ["Alex pasta"])
        XCTAssertEqual(listing.revision, "4")
        let recipeId = try XCTUnwrap(listing.meals.first?.id)
        await model.loadSavedRecipe(UUID())
        XCTAssertEqual(model.savedRecipe, .missing)
        await model.loadSavedRecipe(recipeId)
        guard case .loaded(let recipe) = model.savedRecipe else {
            return XCTFail("Recipe did not load")
        }
        XCTAssertEqual(recipe.title, "Alex pasta")

        await model.signIn(idToken: "B", nonce: "test")
        XCTAssertEqual(model.mealLibrary, .idle)
        XCTAssertEqual(model.savedRecipe, .idle)
        await model.refreshMealLibrary()
        guard case .loaded(let other) = model.mealLibrary else {
            return XCTFail("New account library did not load")
        }
        XCTAssertEqual(other.meals.map(\.title), ["Sam soup"])
    }

    func testLateLibraryReadCannotReplaceNewAccount() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await server.pauseActorA()
        let old = Task { await model.refreshMealLibrary() }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshMealLibrary()
        await server.releaseActorA()
        await old.value
        guard case .loaded(let listing) = model.mealLibrary else {
            return XCTFail("New account library did not load")
        }
        XCTAssertEqual(listing.meals.map(\.title), ["Sam soup"])
    }

    func testLateRecipeDetailCannotReplaceNewAccount() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        guard case .loaded(let oldListing) = model.mealLibrary,
            let recipeId = oldListing.meals.first?.id
        else { return XCTFail("Initial library did not load") }
        await server.pauseActorA()
        let old = Task { await model.loadSavedRecipe(recipeId) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshMealLibrary()
        await model.loadSavedRecipe(recipeId)
        await server.releaseActorA()
        await old.value
        guard case .loaded(let recipe) = model.savedRecipe else {
            return XCTFail("New account recipe did not load")
        }
        XCTAssertEqual(recipe.title, "Sam soup")
    }

    func testLibraryLoadsNextPageAtExactRevisionWithoutRepeatingItems() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        await server.usePagedLibrary()
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        guard case .loaded(let first) = model.mealLibrary else {
            return XCTFail("First library page did not load")
        }
        XCTAssertEqual(first.meals.count, 50)
        XCTAssertNotNil(first.nextAfterId)
        await model.loadNextMealLibraryPage()
        guard case .loaded(let all) = model.mealLibrary else {
            return XCTFail("Next library page did not load")
        }
        XCTAssertEqual(all.meals.count, 51)
        XCTAssertEqual(all.meals.last?.title, "Recipe 51")
        XCTAssertNil(all.nextAfterId)
        let cursor = try XCTUnwrap(first.nextAfterId).uuidString.lowercased()
        let queries = await server.queriedLibraryPages()
        XCTAssertEqual(queries, ["", "afterId=\(cursor)&expectedRevision=4"])
    }

    func testLostRecipePlacementResponseRetriesExactOperationAndShowsOneMeal() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await model.loadSavedRecipe(id)
        guard case .loaded(let recipe) = model.savedRecipe else {
            return XCTFail("Saved recipe did not load")
        }
        await server.loseNextRecipePlace()
        let accepted = await model.placeSavedRecipe(
            date: try CivilDate("2026-09-29"), slot: .dinner, recipe: recipe)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealRecipePlacement?.state, .pending)
        _ = await model.placeSavedRecipe(
            date: try CivilDate("2026-09-29"), slot: .dinner, recipe: recipe)
        let first = await server.recipeOperations()
        XCTAssertEqual(first.count, 1)
        await model.retryMealRecipePlacement()
        let attempts = await server.recipeOperations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.mealRecipePlacement)
        guard case .loaded(let week) = model.mealStatus else {
            return XCTFail("Saved week did not refresh")
        }
        XCTAssertEqual(week.entries.map(\.definitionId), [id])
        XCTAssertEqual(week.entries.map(\.title), ["Alex pasta"])
    }

    func testRejectedRecipePlacementNeedsExplicitDiscard() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await model.loadSavedRecipe(id)
        guard case .loaded(let recipe) = model.savedRecipe else {
            return XCTFail("Saved recipe did not load")
        }
        await server.rejectRecipePlace()
        _ = await model.placeSavedRecipe(
            date: try CivilDate("2026-09-29"), slot: .dinner, recipe: recipe)
        XCTAssertEqual(model.mealRecipePlacement?.state, .conflict)
        await model.refreshMealWeek()
        XCTAssertEqual(model.mealRecipePlacement?.state, .conflict)
        await model.discardConflictedMealRecipePlacement()
        XCTAssertNil(model.mealRecipePlacement)
    }

    func testLibraryRefreshCannotPairAnOldPreviewWithTheNewRevision() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.selectMealWeek(start)
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await model.loadSavedRecipe(id)
        guard case .loaded(let original) = model.savedRecipe else { return XCTFail("Recipe did not load") }
        XCTAssertEqual(model.savedRecipeRevision, "4")
        await server.changeSavedRecipe()
        await model.refreshMealLibrary()
        XCTAssertEqual(model.savedRecipe, .idle)
        XCTAssertNil(model.savedRecipeRevision)
        let oldAccepted = await model.placeSavedRecipe(
            date: try CivilDate("2026-09-29"), slot: .dinner, recipe: original)
        XCTAssertFalse(oldAccepted)
        let refused = await server.recipeOperations()
        XCTAssertTrue(refused.isEmpty)
        await model.loadSavedRecipe(id)
        guard case .loaded(let current) = model.savedRecipe else { return XCTFail("Updated recipe did not load") }
        XCTAssertEqual(current.title, original.title)
        XCTAssertNotEqual(current.instructions, original.instructions)
        XCTAssertEqual(model.savedRecipeRevision, "5")
        let accepted = await model.placeSavedRecipe(date: try CivilDate("2026-09-29"), slot: .dinner, recipe: current)
        XCTAssertTrue(accepted)
        let placed = await server.recipeOperations()
        XCTAssertEqual(placed.count, 1)
    }

    func testLateOldRevisionPreviewCannotReplaceRefreshedLibraryState() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await server.pauseRecipeDetail()
        let old = Task { await model.loadSavedRecipe(id) }
        await server.waitForActorA()
        await server.changeSavedRecipe()
        await model.refreshMealLibrary()
        await server.releaseActorA()
        await old.value
        XCTAssertEqual(model.savedRecipe, .idle)
        XCTAssertNil(model.savedRecipeRevision)
        await model.loadSavedRecipe(id)
        guard case .loaded(let current) = model.savedRecipe else { return XCTFail("Updated recipe did not load") }
        XCTAssertEqual(current.instructions, "Updated cooking instructions.")
        XCTAssertEqual(model.savedRecipeRevision, "5")
    }

    func testMissingSelectionInvalidatesAnAlreadyRunningRecipeRequest() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await server.pauseRecipeDetail()
        let old = Task { await model.loadSavedRecipe(id) }
        await server.waitForActorA()
        await model.loadSavedRecipe(UUID())
        XCTAssertEqual(model.savedRecipe, .missing)
        await server.releaseActorA()
        await old.value
        XCTAssertEqual(model.savedRecipe, .missing)
        XCTAssertNil(model.savedRecipeRevision)
    }

    func testLateForbiddenReverificationCannotClearANewerRecipe() async throws {
        let server = FakeMealServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshMealLibrary()
        let id = await server.savedRecipeId()
        await server.forbidNextRecipe()
        await server.pauseNextMembershipRead()
        let old = Task { await model.loadSavedRecipe(id) }
        await server.waitForActorA()
        await model.loadSavedRecipe(id)
        guard case .loaded(let current) = model.savedRecipe else { return XCTFail("New recipe request did not load") }
        await server.releaseActorA()
        await old.value
        XCTAssertEqual(model.savedRecipe, .loaded(current))
        XCTAssertEqual(model.savedRecipeRevision, "4")
    }
}
