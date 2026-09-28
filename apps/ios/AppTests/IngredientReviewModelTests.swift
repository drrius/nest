import Foundation
import XCTest

@testable import Nest

@MainActor
final class IngredientReviewModelTests: XCTestCase {
    func testLostResponseRetriesExactSelectionAndOldAccountCannotRetry() async throws {
        let a = UUID()
        let b = UUID()
        let household = UUID()
        let server = IngredientAddTestServer(actor: a, household: household)
        let auth = FakeAuthentication(
            active: .init(userId: a, accessToken: "token-A"), nextSignIn: .init(userId: b, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: a, actorB: b, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "ingredient-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: http))
        await model.restore()
        let week = try MealWeekStart("2035-06-04")
        var context = try await model.ingredientReviewContext(week: week)
        let row = MealIngredient(
            entryId: UUID(), ingredientId: UUID(), quantity: "1/2", unit: "cup",
            mealTitle: "Soup", date: week.date, slot: .dinner, name: "Lentils", categoryId: nil, groceryItemId: nil)
        context.listing = try MealIngredientListing(week: week, revision: "2", household: household)
            .appending(
                MealIngredientPage(
                    version: 1, householdId: household, weekStart: week, revision: "2", ingredients: [row], skipped: [],
                    nextAfter: nil))
        let choices = [
            MealIngredientChoice(
                ingredient: .init(entryId: row.entryId, ingredientId: row.ingredientId, quantity: "2", unit: "cups"),
                selected: true)
        ]
        try await model.stageReviewedIngredients(choices, context: context)
        do {
            try await model.retryReviewedIngredients(context)
            XCTFail("Expected lost response")
        } catch {}
        let pending = try await model.ingredientReviewContext(week: week)
        XCTAssertEqual(pending.saved?.pending?.selected, choices.map(\.ingredient))
        try await model.retryReviewedIngredients(pending)
        let saved = try await model.ingredientReviewContext(week: week)
        XCTAssertNotNil(saved.saved?.receipt)
        XCTAssertNil(saved.saved?.pending)
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
        await model.signIn(idToken: "B", nonce: "test")
        do {
            try await model.retryReviewedIngredients(pending)
            XCTFail("Retried old-account request")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let hidden = try await model.ingredientReviewContext(week: week)
        XCTAssertNil(hidden.saved)
    }
}

actor IngredientAddTestServer {
    let actor: UUID
    let household: UUID
    let item = UUID()
    var calls: [AddMealIngredients] = []
    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        guard request.url?.path == "/v1/meals/ingredients/add" else { throw URLError(.unsupportedURL) }
        let command = try JSONDecoder().decode(AddMealIngredients.self, from: request.httpBody!)
        calls.append(command)
        if calls.count == 1 { throw URLError(.networkConnectionLost) }
        let ingredient = command.selected[0]
        let receipt = MealIngredientsReceipt(
            version: 1, actorId: actor, householdId: household,
            operationId: command.operationId, weekStart: command.weekStart, weekRevision: command.expectedRevision,
            ingredients: [
                .init(entryId: ingredient.entryId, ingredientId: ingredient.ingredientId, itemId: item, outcome: .added)
            ])
        struct Envelope: Encodable {
            let version = 1
            let receipt: MealIngredientsReceipt
        }
        return (
            try JSONEncoder().encode(Envelope(receipt: receipt)),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
