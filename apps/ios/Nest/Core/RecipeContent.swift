import Foundation

public struct RecipeContent: Equatable, Sendable {
    public let title: String
    public let servings: Int?
    public let recipeUrl: String?
    public let notes: String?
    public let instructions: String?
    public let ingredients: [SavedIngredient]

    func validated() throws -> Self {
        guard MealLibraryText.validTitle(title), servings.map({ $0 > 0 }) ?? true,
            MealLibraryText.valid(recipeUrl, maximum: 2000),
            MealLibraryText.valid(notes, maximum: 4000),
            MealLibraryText.valid(instructions, maximum: 4000), ingredients.count <= 200,
            Set(ingredients.map(\.id)).count == ingredients.count
        else { throw MealLibraryError.invalidResponse }
        try validateIngredientOrder()
        return self
    }

    private func validateIngredientOrder() throws {
        for (index, ingredient) in ingredients.enumerated() {
            _ = try ingredient.validated()
            if index > 0 {
                let previous = ingredients[index - 1]
                guard
                    ingredient.order > previous.order
                        || (ingredient.order == previous.order
                            && ingredient.id.uuidString.lowercased() > previous.id.uuidString.lowercased())
                else { throw MealLibraryError.invalidResponse }
            }
        }
    }
}
