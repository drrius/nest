import Foundation
import XCTest

@testable import NestCore

final class RecipeCreationTests: XCTestCase {
    func testWireIncludesNullFieldsAndKeepsQuantitySeparate() throws {
        let recipe = draft()
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(recipe)) as? [String: Any])
        XCTAssertTrue(json["recipeUrl"] is NSNull)
        XCTAssertTrue(json["notes"] is NSNull)
        let ingredients = try XCTUnwrap(json["ingredients"] as? [[String: Any]])
        XCTAssertEqual(ingredients[0]["quantity"] as? String, "200")
        XCTAssertEqual(ingredients[0]["unit"] as? String, "g")
        XCTAssertTrue(ingredients[0]["categoryId"] is NSNull)
        XCTAssertTrue(ingredients[0]["note"] is NSNull)
    }

    func testTextAndURLMatchCreationConstraints() throws {
        XCTAssertNoThrow(try draft().validated())
        XCTAssertThrowsError(try draft(title: String(repeating: "🥣", count: 61)).validated())
        XCTAssertThrowsError(try draft(title: " \n ").validated())
        XCTAssertThrowsError(try draft(ingredients: []).validated())
        XCTAssertTrue(RecipeDraft.validURL("https://example.com/recipe?q=soup"))
        for url in [
            "https://user:secret@example.com", "javascript:alert(1)", "https://example.com/\n",
            "https://example.com\\foo", "https://example.com/\u{0085}",
        ] {
            XCTAssertFalse(RecipeDraft.validURL(url), url)
        }
    }

    func testReceiptBindsActorOperationAndIngredientRevisionDelta() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = CreateRecipe(operationId: UUID(), expectedRevision: "8", recipe: draft())
        let receipt = RecipeCreationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: UUID(), revision: "10")
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        let changed = CreateRecipe(operationId: command.operationId, expectedRevision: "9", recipe: draft())
        XCTAssertThrowsError(try receipt.validated(member: member, command: changed))
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try receipt.validated(member: foreign, command: command))
        let overflow = CreateRecipe(operationId: UUID(), expectedRevision: String(Int64.max - 1), recipe: draft())
        XCTAssertThrowsError(try overflow.validated())
    }

    private func draft(title: String = "Soup", ingredients: [RecipeIngredientDraft]? = nil) -> RecipeDraft {
        RecipeDraft(
            title: title, servings: 2, instructions: "Simmer until tender.", recipeUrl: nil, notes: nil,
            ingredients: ingredients ?? [
                RecipeIngredientDraft(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)
            ])
    }
}
