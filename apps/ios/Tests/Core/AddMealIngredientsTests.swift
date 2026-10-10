import Foundation
import XCTest

@testable import NestCore

final class AddMealIngredientsTests: XCTestCase {
    func testReceiptBindsOrderedSelectionAndUniqueGroceries() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let a = ReviewedMealIngredient(entryId: UUID(), ingredientId: UUID(), quantity: nil, unit: nil)
        let b = ReviewedMealIngredient(entryId: UUID(), ingredientId: UUID(), quantity: "1/2", unit: "cup")
        let command = AddMealIngredients(
            operationId: UUID(), weekStart: try MealWeekStart("2035-06-04"), expectedRevision: "2", selected: [a, b])
        let first = MealIngredientAddition(
            entryId: a.entryId, ingredientId: a.ingredientId, itemId: UUID(), outcome: .added)
        let second = MealIngredientAddition(
            entryId: b.entryId, ingredientId: b.ingredientId, itemId: UUID(), outcome: .alreadyAdded)
        func receipt(_ rows: [MealIngredientAddition], actor: UUID? = nil) -> MealIngredientsReceipt {
            .init(
                version: 1, actorId: actor ?? member.userId, householdId: member.householdId,
                operationId: command.operationId,
                weekStart: command.weekStart, weekRevision: "2", ingredients: rows)
        }
        _ = try receipt([first, second]).validated(member: member, command: command)
        XCTAssertThrowsError(try receipt([second, first]).validated(member: member, command: command))
        XCTAssertThrowsError(try receipt([first]).validated(member: member, command: command))
        XCTAssertThrowsError(try receipt([first, second], actor: UUID()).validated(member: member, command: command))
        let duplicate = MealIngredientAddition(
            entryId: b.entryId, ingredientId: b.ingredientId, itemId: first.itemId, outcome: .added)
        XCTAssertThrowsError(try receipt([first, duplicate]).validated(member: member, command: command))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(a)) as? [String: Any])
        XCTAssertTrue(json["quantity"] is NSNull)
        XCTAssertTrue(json["unit"] is NSNull)
        let repeated = AddMealIngredients(
            operationId: UUID(), weekStart: command.weekStart, expectedRevision: "2", selected: [a, a])
        XCTAssertThrowsError(try repeated.validated())
    }

    func testReconciliationRetainsChoicesWithoutSelectingNewOrAddedRows() throws {
        let entry = UUID()
        let ingredient = UUID()
        func row(_ id: UUID, grocery: UUID? = nil) throws -> MealIngredient {
            MealIngredient(
                entryId: entry, ingredientId: id, quantity: "1", unit: "cup", mealTitle: "Soup",
                date: try CivilDate("2035-06-04"), slot: .dinner, name: "Lentils", categoryId: nil,
                groceryItemId: grocery)
        }
        let prior = MealIngredientChoice(
            ingredient: .init(entryId: entry, ingredientId: ingredient, quantity: "2", unit: "cups"), selected: true)
        let original = try row(ingredient)
        let fresh = try row(UUID())
        let choices = try MealIngredientChoice.reconcile(rows: [original, fresh], previous: [prior])
        XCTAssertEqual(choices[0], prior)
        XCTAssertFalse(choices[1].selected)
        let added = try MealIngredientChoice.reconcile(rows: [row(ingredient, grocery: UUID())], previous: [prior])
        XCTAssertFalse(added[0].selected)
        XCTAssertEqual(added[0].ingredient.quantity, "2")
        XCTAssertThrowsError(try MealIngredientChoice.reconcile(rows: [original, original], previous: []))
        XCTAssertThrowsError(try MealIngredientChoice.reconcile(rows: [original], previous: [prior, prior]))
    }
}
