import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecipeCreationModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()

    func testLostReplyRetriesExactRecipeAndReconciles() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await server.loseReply()
        let accepted = await model.createRecipe(draft, context: context)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.recipeCreation?.state, .pending)
        await model.refreshMealLibrary()
        XCTAssertEqual(model.recipeCreation?.state, .pending)
        await model.retryRecipeCreation()
        XCTAssertNil(model.recipeCreation)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let listing) = model.mealLibrary else { return XCTFail("Missing library") }
        XCTAssertEqual(listing.meals.map(\.title), ["Soup"])
    }

    func testOldAccountDraftCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.createRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testUnavailableLibraryRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await server.setLibraryAvailable(false)
        let accepted = await model.createRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeCreation)
        let persisted = try await model.offline?.readRecipeCreation(lease: XCTUnwrap(model.lease))
        XCTAssertNil(persisted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testChangedLibraryRefusesThenFreshContextSavesSameDraft() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await server.changeLibraryRevision()
        let refused = await model.createRecipe(draft, context: context)
        XCTAssertFalse(refused)
        XCTAssertNil(model.recipeCreation)
        let persisted = try await model.offline?.readRecipeCreation(lease: XCTUnwrap(model.lease))
        XCTAssertNil(persisted)
        let before = await server.attempts
        XCTAssertTrue(before.isEmpty)
        let fresh = try await model.loadRecipeCreateContext()
        let accepted = await model.createRecipe(draft, context: fresh)
        XCTAssertTrue(accepted)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        XCTAssertEqual(attempts.first?.expectedRevision, "2")
        XCTAssertEqual(attempts.first?.recipe, draft)
        XCTAssertNil(model.recipeCreation)
    }

    func testAccountChangeDuringLibraryCheckRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await server.holdNextLibraryRead()
        let save = Task { await model.createRecipe(draft, context: context) }
        await server.waitForHeldLibraryRead()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseLibraryRead()
        let accepted = await save.value
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeCreation)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testConflictRequiresExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeCreateContext()
        await server.reject()
        _ = await model.createRecipe(draft, context: context)
        XCTAssertEqual(model.recipeCreation?.state, .conflict)
        await model.retryRecipeCreation()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardRecipeCreationConflict()
        XCTAssertNil(model.recipeCreation)
    }

    private var draft: RecipeDraft {
        RecipeDraft(
            title: "Soup", servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
            ingredients: [
                RecipeIngredientDraft(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)
            ])
    }

    private func fixture() throws -> (SessionModel, RecipeCreationTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = RecipeCreationTestServer(actor: actorA, household: household)
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

actor RecipeCreationTestServer {
    let definition = UUID()
    let actor: UUID
    let household: UUID
    var attempts: [CreateRecipe] = []
    private var created: CreateRecipe?
    private var lose = false
    private var rejected = false
    private var libraryAvailable = true
    private var libraryRevision = "1"
    private var holdLibrary = false
    private var libraryStarted = false
    private var libraryWaiter: CheckedContinuation<Void, Never>?
    private var libraryGate: CheckedContinuation<Void, Never>?

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }
    func setLibraryAvailable(_ available: Bool) { libraryAvailable = available }
    func changeLibraryRevision() { libraryRevision = "2" }
    func holdNextLibraryRead() { holdLibrary = true }
    func waitForHeldLibraryRead() async {
        if libraryStarted { return }
        await withCheckedContinuation { libraryWaiter = $0 }
    }
    func releaseLibraryRead() {
        libraryGate?.resume()
        libraryGate = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/meals/recipe/create" {
            let command = try JSONDecoder().decode(CreateRecipe.self, from: request.httpBody!)
            attempts.append(command)
            if rejected { return try answer(request, ["error": ["code": "conflict"]], status: 409) }
            created = command
            if lose {
                lose = false
                throw URLError(.networkConnectionLost)
            }
            return try answer(
                request,
                [
                    "version": 1,
                    "receipt": [
                        "version": 1, "actorId": actor.uuidString, "householdId": household.uuidString,
                        "operationId": command.operationId.uuidString, "definitionId": definition.uuidString,
                        "revision": revision,
                    ],
                ])
        }
        if request.url?.path == "/v1/meals/library" { return try await library(request) }
        return try answer(
            request,
            [
                "version": 1, "householdId": household.uuidString, "revision": revision,
                "recipe": [
                    "definitionId": definition.uuidString, "title": "Soup", "servings": 2,
                    "instructions": "Simmer.", "recipeUrl": NSNull(), "notes": NSNull(),
                    "ingredients": [
                        [
                            "ingredientId": UUID().uuidString, "name": "Lentils", "quantity": "200",
                            "unit": "g", "categoryId": NSNull(), "note": NSNull(), "order": 0,
                        ]
                    ],
                ],
            ])
    }

    private func library(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard libraryAvailable else {
            return try answer(request, ["error": ["code": "unavailable"]], status: 503)
        }
        if holdLibrary {
            holdLibrary = false
            libraryStarted = true
            libraryWaiter?.resume()
            libraryWaiter = nil
            await withCheckedContinuation { libraryGate = $0 }
        }
        let meals: [[String: Any]] =
            created == nil
            ? []
            : [
                [
                    "definitionId": definition.uuidString, "title": "Soup", "servings": 2,
                ]
            ]
        return try answer(
            request,
            [
                "version": 1, "householdId": household.uuidString,
                "revision": revision, "meals": meals, "nextAfterId": NSNull(),
            ])
    }

    private var revision: String {
        guard let created else { return libraryRevision }
        return String(Int64(created.expectedRevision)! + Int64(created.recipe.ingredients.count + 1))
    }

    private func answer(_ request: URLRequest, _ body: [String: Any], status: Int = 200) throws -> (Data, URLResponse) {
        (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
