import Foundation

struct MealIngredientChoice: Codable, Equatable, Identifiable, Sendable {
    var ingredient: ReviewedMealIngredient
    var selected: Bool
    var id: MealIngredientSource { ingredient.source }

    static func reconcile(rows: [MealIngredient], previous: [Self]) throws -> [Self] {
        guard Set(rows.map(\.id)).count == rows.count, Set(previous.map(\.id)).count == previous.count
        else { throw MealLibraryError.invalidResponse }
        let retained = Dictionary(uniqueKeysWithValues: previous.map { ($0.id, $0) })
        return rows.map { row in
            let prior = retained[row.id]
            return Self(
                ingredient: prior?.ingredient
                    ?? ReviewedMealIngredient(
                        entryId: row.entryId, ingredientId: row.ingredientId, quantity: row.quantity, unit: row.unit),
                selected: row.groceryItemId == nil && (prior?.selected ?? false))
        }
    }
}
