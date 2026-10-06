import Foundation
import XCTest

@testable import NestCore

final class RecipeEditDraftTests: XCTestCase {
    func testUntouchedAndRestoredRawDraftDoesNotNeedDiscard() {
        let baseline = recipe()
        var draft = RecipeEditDraft(baseline)
        XCTAssertFalse(draft.dirty)
        draft.notes = ""
        XCTAssertTrue(draft.dirty)
        draft.notes = baseline.notes ?? ""
        XCTAssertFalse(draft.dirty)
        draft.title += " "
        XCTAssertTrue(draft.dirty)
        draft.title = baseline.title
        XCTAssertFalse(draft.dirty)
    }

    func testInvalidRawDraftStillNeedsDiscard() {
        var draft = RecipeEditDraft(recipe())
        draft.servings = "not a number"
        XCTAssertTrue(draft.dirty)
        XCTAssertThrowsError(try draft.command(operation: UUID(), revision: "5"))
        draft = RecipeEditDraft(draft.baseline)
        draft.ingredients[0].name = ""
        XCTAssertTrue(draft.dirty)
        XCTAssertThrowsError(try draft.command(operation: UUID(), revision: "5"))
    }

    func testIngredientRemovalAndUnfilledAdditionNeedDiscard() {
        var draft = RecipeEditDraft(recipe())
        draft.ingredients.removeAll()
        XCTAssertTrue(draft.dirty)
        draft = RecipeEditDraft(draft.baseline)
        draft.ingredients.append(RecipeEditIngredient())
        XCTAssertTrue(draft.dirty)
        draft.ingredients.removeLast()
        XCTAssertFalse(draft.dirty)
    }

    func testIngredientReorderingNeedsDiscardUntilRestored() {
        let original = recipe()
        let baseline = SavedRecipe(
            definitionId: original.id, title: original.title, servings: original.servings,
            recipeUrl: original.recipeUrl, notes: original.notes, instructions: original.instructions,
            ingredients: original.ingredients + [
                SavedIngredient(
                    ingredientId: UUID(), name: "Salt", quantity: nil, unit: nil,
                    categoryId: nil, note: nil, order: 5)
            ])
        var draft = RecipeEditDraft(baseline)
        draft.ingredients.reverse()
        XCTAssertTrue(draft.dirty)
        draft.ingredients.reverse()
        XCTAssertFalse(draft.dirty)
    }

    func testUnchangedLegacyValuesAreOmitted() throws {
        let baseline = recipe()
        var draft = RecipeEditDraft(baseline)
        XCTAssertThrowsError(try draft.command(operation: UUID(), revision: "5"))
        draft.title = "New title"
        let command = try draft.command(operation: UUID(), revision: "5")
        XCTAssertEqual(command.patch.title, "New title")
        XCTAssertNil(command.patch.recipeUrl)
        XCTAssertNil(command.patch.instructions)
        XCTAssertNil(command.ingredients)
    }

    func testClearAndReorderRetainIdentityAndCategory() throws {
        let baseline = recipe()
        var draft = RecipeEditDraft(baseline)
        draft.notes = ""
        draft.ingredients[0].quantity = ""
        draft.ingredients.append(RecipeEditIngredient())
        draft.ingredients[1].name = "Salt"
        draft.ingredients.reverse()
        let command = try draft.command(operation: UUID(), revision: "5")
        XCTAssertNotNil(command.patch.notes)
        XCTAssertNil(command.patch.notes!)
        guard let ingredients = command.ingredients, case .existing(let id, let patch) = ingredients[1] else {
            return XCTFail("Existing ingredient identity lost")
        }
        XCTAssertEqual(id, baseline.ingredients[0].id)
        XCTAssertNotNil(patch.quantity)
        XCTAssertNil(patch.quantity!)
        XCTAssertNil(patch.categoryId)
    }

    private func recipe() -> SavedRecipe {
        SavedRecipe(
            definitionId: UUID(), title: "Legacy soup", servings: nil, recipeUrl: "legacy:retained",
            notes: "Keep", instructions: nil,
            ingredients: [
                SavedIngredient(
                    ingredientId: UUID(), name: "Lentils",
                    quantity: "200", unit: "g", categoryId: UUID(), note: nil, order: 4)
            ])
    }
}
