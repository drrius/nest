import Foundation
import XCTest

@testable import NestCore

final class MealLibraryTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let definition = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let ingredient = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testPageBindsHouseholdRevisionAndOrderedIds() throws {
        let page = try JSONDecoder().decode(MealLibraryPage.self, from: Data(pageBody.utf8))
        XCTAssertNoThrow(try page.validated(household: household, after: nil, revision: nil))
        XCTAssertThrowsError(try page.validated(household: UUID(), after: nil, revision: nil))
        XCTAssertThrowsError(try page.validated(household: household, after: nil, revision: "3"))
        XCTAssertThrowsError(try page.validated(household: household, after: definition, revision: "2"))
        let badCursor = pageBody.replacingOccurrences(
            of: "\"nextAfterId\":null", with: "\"nextAfterId\":\"\(definition)\"")
        let invalid = try JSONDecoder().decode(MealLibraryPage.self, from: Data(badCursor.utf8))
        XCTAssertThrowsError(try invalid.validated(household: household, after: nil, revision: nil))
    }

    func testRecipeBindsExactDefinitionAndRejectsDuplicateIngredients() throws {
        let recipe = try JSONDecoder().decode(SavedRecipeEnvelope.self, from: Data(recipeBody.utf8))
        let saved = try XCTUnwrap(
            recipe.validated(household: household, definition: definition, revision: "2"))
        XCTAssertEqual(saved.title, "Pasta")
        XCTAssertEqual(saved.ingredients.first?.quantity, "200")
        XCTAssertThrowsError(
            try recipe.validated(household: household, definition: UUID(), revision: "2"))
        let duplicate = recipeBody.replacingOccurrences(
            of: "\"ingredients\":[\(ingredientBody)]",
            with: "\"ingredients\":[\(ingredientBody),\(ingredientBody)]")
        let invalid = try JSONDecoder().decode(SavedRecipeEnvelope.self, from: Data(duplicate.utf8))
        XCTAssertThrowsError(
            try invalid.validated(household: household, definition: definition, revision: "2"))
        let missing = try JSONDecoder().decode(
            SavedRecipeEnvelope.self,
            from: Data("{\"version\":1,\"householdId\":\"\(household)\",\"revision\":\"2\",\"recipe\":null}".utf8))
        XCTAssertNil(try missing.validated(household: household, definition: definition, revision: "2"))
    }

    func testAuthorizedLibraryAndRecipeRequestsUseExactRevision() async throws {
        let householdHeader = household.uuidString.lowercased()
        let definitionId = definition.uuidString.lowercased()
        let pageBody = pageBody
        let recipeBody = recipeBody
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), householdHeader)
            XCTAssertEqual(request.httpMethod, "GET")
            let path = request.url?.path
            let body: String
            if path == "/v1/meals/library" {
                XCTAssertNil(request.url?.query)
                body = pageBody
            } else {
                XCTAssertEqual(path, "/v1/meals/recipe")
                XCTAssertEqual(
                    request.url?.query,
                    "definitionId=\(definitionId)&expectedRevision=2")
                body = recipeBody
            }
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
        let api = MealAPI(http: http)
        let page = try await api.library(token: "member-token", member: member)
        XCTAssertEqual(page.meals.first?.id, definition)
        let recipe = try await api.recipe(
            token: "member-token", member: member, id: definition, revision: page.revision)
        XCTAssertEqual(recipe?.title, "Pasta")
    }

    func testStoredRecipeLinkOnlyOpensHttpWithoutEmbeddedCredentials() {
        XCTAssertEqual(
            MealLibraryText.openableURL("https://recipes.example/pasta")?.host,
            "recipes.example")
        XCTAssertNil(MealLibraryText.openableURL("javascript:alert(1)"))
        XCTAssertNil(MealLibraryText.openableURL("file:///private/notes"))
        XCTAssertNil(MealLibraryText.openableURL("https://name:password@recipes.example/"))
        XCTAssertNil(MealLibraryText.openableURL("//recipes.example/pasta"))
    }

    private var pageBody: String {
        """
        {"version":1,"householdId":"\(household)","revision":"2","meals":[{"definitionId":"\(definition)","title":"Pasta","servings":2}],"nextAfterId":null}
        """
    }

    private var ingredientBody: String {
        """
        {"ingredientId":"\(ingredient)","name":"Pasta","quantity":"200","unit":"g","categoryId":null,"note":null,"order":0}
        """
    }

    private var recipeBody: String {
        """
        {"version":1,"householdId":"\(household)","revision":"2","recipe":{"definitionId":"\(definition)","title":"Pasta","servings":2,"recipeUrl":null,"notes":null,"instructions":"Boil and serve.","ingredients":[\(ingredientBody)]}}
        """
    }
}
