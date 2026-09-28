import Foundation
import XCTest

@testable import NestCore

final class RecipeEditStoreTests: XCTestCase {
    func testRestartPreservesClearIntentAndRequiresExactIngredients() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "recipe-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let original = recipe(quantity: "200")
        let command = EditRecipe(
            operationId: UUID(), definitionId: original.id, expectedRevision: "5",
            patch: .init(notes: .some(nil)),
            ingredients: [.existing(original.ingredients[0].id, .init(quantity: .some(nil)))])
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRecipeEdit(command, baseline: original, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let restored = try await reopened.activate(member)
        let pending = try await reopened.readRecipeEdit(lease: restored)
        XCTAssertEqual(pending?.command, command)
        let receipt = RecipeEditReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: original.id, previousRevision: "5", revision: "7")
        try await reopened.acknowledgeRecipeEdit(receipt, lease: restored)
        try await reopened.reconcileRecipeEdit(
            SavedRecipeEnvelope(
                version: 1, householdId: member.householdId,
                revision: "7", recipe: original), lease: restored)
        let waiting = try await reopened.readRecipeEdit(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        let changed = recipe(id: original.id, ingredientId: original.ingredients[0].id, quantity: nil)
        XCTAssertTrue(command.matches(changed, baseline: original))
        try await reopened.reconcileRecipeEdit(
            SavedRecipeEnvelope(
                version: 1, householdId: member.householdId,
                revision: "7", recipe: changed), lease: restored)
        let finished = try await reopened.readRecipeEdit(lease: restored)
        XCTAssertNil(finished)
    }

    func testUnknownIngredientRejectedAndOrderChangesMatter() throws {
        let original = recipe(quantity: "200")
        let unknown = EditRecipe(
            operationId: UUID(), definitionId: original.id, expectedRevision: "5",
            patch: .init(), ingredients: [.existing(UUID(), .init())])
        XCTAssertThrowsError(try unknown.validated(against: original))
        let new = RecipeIngredientDraft(name: "Salt", quantity: nil, unit: nil, categoryId: nil, note: nil)
        let command = EditRecipe(
            operationId: UUID(), definitionId: original.id, expectedRevision: "5", patch: .init(),
            ingredients: [.new(new), .existing(original.ingredients[0].id, .init())])
        let salt = SavedIngredient(
            ingredientId: UUID(), name: "Salt", quantity: nil, unit: nil, categoryId: nil, note: nil, order: 0)
        let right = SavedRecipe(
            definitionId: original.id, title: original.title, servings: original.servings,
            recipeUrl: original.recipeUrl, notes: original.notes, instructions: original.instructions,
            ingredients: [salt, original.ingredients[0]])
        XCTAssertTrue(command.matches(right, baseline: original))
        let wrong = SavedRecipe(
            definitionId: original.id, title: original.title, servings: original.servings,
            recipeUrl: original.recipeUrl, notes: original.notes, instructions: original.instructions,
            ingredients: [original.ingredients[0], salt])
        XCTAssertFalse(command.matches(wrong, baseline: original))
    }

    private func recipe(id: UUID = UUID(), ingredientId: UUID = UUID(), quantity: String?) -> SavedRecipe {
        SavedRecipe(
            definitionId: id, title: "Lentils", servings: 2, recipeUrl: nil, notes: nil,
            instructions: "Simmer.",
            ingredients: [
                SavedIngredient(
                    ingredientId: ingredientId, name: "Lentils",
                    quantity: quantity, unit: "g", categoryId: nil, note: nil, order: 0)
            ])
    }
}
