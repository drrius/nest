import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecipeArchiveModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()

    func testLostReplyRetriesExactRecipeAndReconciles() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        await server.loseReply()
        let accepted = await model.archiveRecipe(context: context)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.recipeArchive?.state, .pending)
        await model.refreshMealLibrary()
        XCTAssertEqual(model.recipeArchive?.state, .pending)
        await model.retryRecipeArchive()
        XCTAssertNil(model.recipeArchive)
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
        guard case .loaded(let listing) = model.mealLibrary else { return XCTFail("Missing library") }
        XCTAssertEqual(listing.meals.map(\.title), [])
    }

    func testOldAccountDraftCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.archiveRecipe(context: context)
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testConflictRequiresExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadRecipeArchiveContext(server.definition)
        await server.reject()
        _ = await model.archiveRecipe(context: context)
        XCTAssertEqual(model.recipeArchive?.state, .conflict)
        await model.retryRecipeArchive()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardRecipeArchiveConflict()
        XCTAssertNil(model.recipeArchive)
    }

    private func fixture() throws -> (SessionModel, RecipeArchiveTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let server = RecipeArchiveTestServer(actor: actorA, household: household)
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

actor RecipeArchiveTestServer {
    let definition = UUID()
    let actor: UUID
    let household: UUID
    var attempts: [ArchiveRecipe] = []
    private var created: ArchiveRecipe?
    private var lose = false
    private var rejected = false

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/meals/recipe/archive" {
            let command = try JSONDecoder().decode(ArchiveRecipe.self, from: request.httpBody!)
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
                        "revision": "2",
                    ],
                ])
        }
        if request.url?.path == "/v1/meals/library" {
            let meals: [[String: Any]] =
                created != nil
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
                    "revision": created == nil ? "1" : "2", "meals": meals, "nextAfterId": NSNull(),
                ])
        }
        if created != nil {
            return try answer(
                request, ["version": 1, "householdId": household.uuidString, "revision": "2", "recipe": NSNull()])
        }
        return try answer(
            request,
            [
                "version": 1, "householdId": household.uuidString, "revision": "1",
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

    private func answer(_ request: URLRequest, _ body: [String: Any], status: Int = 200) throws -> (Data, URLResponse) {
        (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
