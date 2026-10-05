import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecipeEditModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()

    func testLostReplyRetriesExactRecipeAndReconciles() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.loseReply()
        let accepted = await model.editRecipe(draft, context: context)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.recipeEdit?.state, .pending)
        await model.refreshMealLibrary()
        XCTAssertEqual(model.recipeEdit?.state, .pending)
        await model.retryRecipeEdit()
        XCTAssertNil(model.recipeEdit)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let listing) = model.mealLibrary else { return XCTFail("Missing library") }
        XCTAssertEqual(listing.meals.map(\.title), ["Soup"])
        await model.loadSavedRecipe(server.definition)
        guard case .loaded(let recipe) = model.savedRecipe else { return XCTFail("Missing recipe") }
        XCTAssertNil(recipe.ingredients[0].quantity)
        XCTAssertEqual(recipe.ingredients[0].id, context.recipe.ingredients[0].id)
    }

    func testOldAccountDraftCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.editRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testConflictRequiresExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.reject()
        _ = await model.editRecipe(draft, context: context)
        XCTAssertEqual(model.recipeEdit?.state, .conflict)
        await model.retryRecipeEdit()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardRecipeEditConflict()
        XCTAssertNil(model.recipeEdit)
    }

    func testUnavailableLibraryRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.setLibraryAvailable(false)
        let accepted = await model.editRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeEdit)
        let persisted = try await model.offline?.readRecipeEdit(lease: XCTUnwrap(model.lease))
        XCTAssertNil(persisted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testChangedLibraryRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.changeLibraryRevision()
        let accepted = await model.editRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeEdit)
        let persisted = try await model.offline?.readRecipeEdit(lease: XCTUnwrap(model.lease))
        XCTAssertNil(persisted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testChangedRecipeAtSameRevisionRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.changeRecipe()
        let accepted = await model.editRecipe(draft, context: context)
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeEdit)
        let persisted = try await model.offline?.readRecipeEdit(lease: XCTUnwrap(model.lease))
        XCTAssertNil(persisted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testAccountChangeDuringRecipeCheckRefusesBeforeStaging() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        var draft = RecipeEditDraft(context.recipe)
        draft.ingredients[0].quantity = ""
        await server.holdNextRecipeRead()
        let save = Task { await model.editRecipe(draft, context: context) }
        await server.waitForHeldRecipeRead()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseRecipeRead()
        let accepted = await save.value
        XCTAssertFalse(accepted)
        XCTAssertNil(model.recipeEdit)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    private func fixture() throws -> (SessionModel, RecipeEditTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = RecipeEditTestServer(actor: actorA, household: household)
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

actor RecipeEditTestServer {
    let definition = UUID()
    let ingredient = UUID()
    let actor: UUID
    let household: UUID
    var attempts: [EditRecipe] = []
    private var created: EditRecipe?
    private var lose = false
    private var rejected = false
    private var libraryAvailable = true
    private var libraryRevision = "1"
    private var instructions = "Simmer."
    private var holdRecipe = false
    private var recipeStarted = false
    private var recipeWaiter: CheckedContinuation<Void, Never>?
    private var recipeGate: CheckedContinuation<Void, Never>?

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }
    func setLibraryAvailable(_ available: Bool) { libraryAvailable = available }
    func changeLibraryRevision() { libraryRevision = "3" }
    func changeRecipe() { instructions = "Partner instructions." }
    func holdNextRecipeRead() { holdRecipe = true }
    func waitForHeldRecipeRead() async {
        if recipeStarted { return }
        await withCheckedContinuation { recipeWaiter = $0 }
    }
    func releaseRecipeRead() {
        recipeGate?.resume()
        recipeGate = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/meals/recipe/edit" {
            let command = try JSONDecoder().decode(EditRecipe.self, from: request.httpBody!)
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
                        "previousRevision": command.expectedRevision, "revision": "2",
                    ],
                ])
        }
        if request.url?.path == "/v1/meals/library" {
            guard libraryAvailable else {
                return try answer(request, ["error": ["code": "unavailable"]], status: 503)
            }
            let meals: [[String: Any]] =
                [
                    [
                        "definitionId": definition.uuidString, "title": "Soup", "servings": 2,
                    ]
                ]
            return try answer(
                request,
                [
                    "version": 1, "householdId": household.uuidString,
                    "revision": created == nil ? libraryRevision : "2", "meals": meals, "nextAfterId": NSNull(),
                ])
        }
        if holdRecipe {
            holdRecipe = false
            recipeStarted = true
            recipeWaiter?.resume()
            recipeWaiter = nil
            await withCheckedContinuation { recipeGate = $0 }
        }
        return try answer(
            request,
            [
                "version": 1, "householdId": household.uuidString, "revision": created == nil ? "1" : "2",
                "recipe": [
                    "definitionId": definition.uuidString, "title": "Soup", "servings": 2,
                    "instructions": instructions, "recipeUrl": NSNull(), "notes": NSNull(),
                    "ingredients": [
                        [
                            "ingredientId": ingredient.uuidString, "name": "Lentils",
                            "quantity": created == nil ? "200" as Any : NSNull(),
                            "unit": "g", "categoryId": NSNull(), "note": NSNull(), "order": 0,
                        ]
                    ],
                ],
            ])
    }

    private func answer(_ request: URLRequest, _ body: [String: Any], status: Int = 200) throws -> (Data, URLResponse) {
        (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
