import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealLibraryModelTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

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
}
