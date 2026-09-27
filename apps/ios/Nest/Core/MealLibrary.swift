import Foundation

public struct SavedMealSummary: Codable, Equatable, Identifiable, Sendable {
    public let definitionId: UUID
    public let title: String
    public let servings: Int?

    public var id: UUID { definitionId }

    func validated() throws -> Self {
        guard MealLibraryText.validTitle(title), servings.map { $0 > 0 } ?? true
        else { throw MealLibraryError.invalidResponse }
        return self
    }
}

public struct SavedIngredient: Codable, Equatable, Identifiable, Sendable {
    public let ingredientId: UUID
    public let name: String
    public let quantity: String?
    public let unit: String?
    public let categoryId: UUID?
    public let note: String?
    public let order: Int

    public var id: UUID { ingredientId }

    func validated() throws -> Self {
        guard MealLibraryText.validTitle(name), order >= 0,
            MealLibraryText.valid(quantity, maximum: 80),
            MealLibraryText.valid(unit, maximum: 80),
            MealLibraryText.valid(note, maximum: 1000)
        else { throw MealLibraryError.invalidResponse }
        return self
    }
}

public struct SavedRecipe: Codable, Equatable, Identifiable, Sendable {
    public let definitionId: UUID
    public let title: String
    public let servings: Int?
    public let recipeUrl: String?
    public let notes: String?
    public let instructions: String?
    public let ingredients: [SavedIngredient]

    public var id: UUID { definitionId }

    func validated() throws -> Self {
        _ = try SavedMealSummary(definitionId: definitionId, title: title, servings: servings)
            .validated()
        guard ingredients.count <= 200,
            MealLibraryText.valid(recipeUrl, maximum: 2000),
            MealLibraryText.valid(notes, maximum: 4000),
            MealLibraryText.valid(instructions, maximum: 4000),
            Set(ingredients.map(\.id)).count == ingredients.count
        else { throw MealLibraryError.invalidResponse }
        for (index, ingredient) in ingredients.enumerated() {
            _ = try ingredient.validated()
            if index > 0 {
                let previous = ingredients[index - 1]
                guard
                    ingredient.order > previous.order
                        || (ingredient.order == previous.order
                            && ingredient.id.uuidString.lowercased()
                                > previous.id.uuidString.lowercased())
                else { throw MealLibraryError.invalidResponse }
            }
        }
        return self
    }
}

public struct MealLibraryPage: Decodable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let revision: String
    public let meals: [SavedMealSummary]
    public let nextAfterId: UUID?

    func validated(household: UUID, after: UUID?, revision expected: String?) throws -> Self {
        guard version == 1, householdId == household, MealRevision.valid(revision),
            expected == nil || expected == revision, meals.count <= 50,
            nextAfterId == nil || (meals.count == 50 && nextAfterId == meals.last?.id)
        else { throw MealLibraryError.invalidResponse }
        for (index, meal) in meals.enumerated() {
            _ = try meal.validated()
            let id = meal.id.uuidString.lowercased()
            if let after, id <= after.uuidString.lowercased() {
                throw MealLibraryError.invalidResponse
            }
            if index > 0, id <= meals[index - 1].id.uuidString.lowercased() {
                throw MealLibraryError.invalidResponse
            }
        }
        return self
    }
}

public struct SavedRecipeEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let revision: String
    public let recipe: SavedRecipe?

    func validated(household: UUID, definition: UUID, revision expected: String) throws -> SavedRecipe? {
        guard version == 1, householdId == household, revision == expected,
            MealRevision.valid(revision), recipe == nil || recipe?.id == definition
        else { throw MealLibraryError.invalidResponse }
        return try recipe?.validated()
    }
}

public enum MealLibraryError: Error { case invalidResponse }

public enum MealLibraryText {
    static func validTitle(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .init(charactersIn: " "))
        return !trimmed.isEmpty && trimmed.unicodeScalars.count <= 120 && !value.contains("\0")
    }

    static func valid(_ value: String?, maximum: Int) -> Bool {
        guard let value else { return true }
        return value.unicodeScalars.count <= maximum && !value.contains("\0")
    }

    public static func openableURL(_ raw: String?) -> URL? {
        guard let raw, let url = URL(string: raw),
            ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
            url.host != nil, url.user == nil, url.password == nil
        else { return nil }
        return url
    }
}
