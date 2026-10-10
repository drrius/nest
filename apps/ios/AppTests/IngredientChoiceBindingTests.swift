import SwiftUI
import XCTest

@testable import Nest

@MainActor
final class IngredientChoiceBindingTests: XCTestCase {
    func testRetiredSwitchBindingSurvivesClearedAndReplacedChoices() {
        let original = choice()
        var choices = [original]
        let binding = identifiedDraftBinding(
            for: original, in: Binding(get: { choices }, set: { choices = $0 }))

        choices.removeAll()
        XCTAssertEqual(binding.wrappedValue, original)
        var lateEdit = original
        lateEdit.selected = true
        binding.wrappedValue = lateEdit
        XCTAssertTrue(choices.isEmpty)

        let replacement = choice()
        choices = [replacement]
        XCTAssertEqual(binding.wrappedValue, original)
        binding.wrappedValue = lateEdit
        XCTAssertEqual(choices, [replacement])
    }

    func testReorderingKeepsEditsOnTheSameSourceAndRejectsAnotherIdentity() {
        let original = choice()
        let other = choice()
        var choices = [original, other]
        let binding = identifiedDraftBinding(
            for: original, in: Binding(get: { choices }, set: { choices = $0 }))

        choices = [other, original]
        var edited = binding.wrappedValue
        edited.selected = true
        edited.ingredient.quantity = "200"
        edited.ingredient.unit = "g"
        binding.wrappedValue = edited
        XCTAssertEqual(choices, [other, edited])
        XCTAssertEqual(binding.wrappedValue, edited)

        binding.wrappedValue = other
        XCTAssertEqual(choices, [other, edited])
    }

    private func choice() -> MealIngredientChoice {
        MealIngredientChoice(
            ingredient: .init(entryId: UUID(), ingredientId: UUID(), quantity: "1", unit: nil), selected: false)
    }
}
