import Foundation
import XCTest

@testable import NestCore

final class RecipeEditDraftTests: XCTestCase {
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
