import SwiftUI
import XCTest

@testable import Nest

@MainActor
final class RecipeDraftBindingTests: XCTestCase {
    func testCreateIngredientBindingSurvivesReorderingAndDeletion() {
        var first = RecipeIngredientFields()
        first.name = "Lentils"
        var other = RecipeIngredientFields()
        other.name = "Rice"
        var ingredients = [first, other]
        let binding = identifiedDraftBinding(
            for: first, in: Binding(get: { ingredients }, set: { ingredients = $0 }))

        ingredients = [other, first]
        binding.wrappedValue.quantity = "200"
        binding.wrappedValue.unit = "g"
        XCTAssertEqual(ingredients[0].name, "Rice")
        XCTAssertEqual(ingredients[0].quantity, "")
        XCTAssertEqual(ingredients[1].id, first.id)
        XCTAssertEqual(ingredients[1].quantity, "200")
        XCTAssertEqual(ingredients[1].unit, "g")

        ingredients.removeLast()
        XCTAssertEqual(binding.wrappedValue.id, first.id)
        binding.wrappedValue.name = "Late edit"
        XCTAssertEqual(ingredients.count, 1)
        XCTAssertEqual(ingredients[0].id, other.id)
        XCTAssertEqual(ingredients[0].name, "Rice")
        ingredients.removeAll()
        binding.wrappedValue = first
        XCTAssertTrue(ingredients.isEmpty)
    }

    func testEditIngredientBindingKeepsIdentityAfterMoveAndIgnoresRetiredWrites() {
        var first = RecipeEditIngredient()
        first.name = "Lentils"
        var other = RecipeEditIngredient()
        other.name = "Rice"
        other.note = "Preserve this note"
        var ingredients = [first, other]
        let binding = identifiedDraftBinding(
            for: first, in: Binding(get: { ingredients }, set: { ingredients = $0 }))

        ingredients = [other, first]
        binding.wrappedValue.note = "Rinse first"
        XCTAssertEqual(ingredients[1].id, first.id)
        XCTAssertEqual(ingredients[1].note, "Rinse first")
        binding.wrappedValue = other
        XCTAssertEqual(ingredients[1].id, first.id)
        XCTAssertEqual(ingredients[1].note, "Rinse first")
        XCTAssertEqual(ingredients[0].note, "Preserve this note")

        ingredients.removeLast()
        binding.wrappedValue.quantity = "500"
        XCTAssertEqual(binding.wrappedValue.id, first.id)
        XCTAssertEqual(ingredients.count, 1)
        XCTAssertEqual(ingredients[0].id, other.id)
        XCTAssertEqual(ingredients[0].quantity, "")
        XCTAssertEqual(ingredients[0].note, "Preserve this note")
    }
}
