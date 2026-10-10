import Foundation

public struct MealIngredientSource: Codable, Equatable, Hashable, Sendable {
    public let entryId: UUID
    public let ingredientId: UUID

    var key: String { "\(entryId.uuidString.lowercased()):\(ingredientId.uuidString.lowercased())" }
}

public struct MealIngredient: Codable, Equatable, Identifiable, Sendable {
    public let entryId: UUID
    public let ingredientId: UUID
    public let quantity: String?
    public let unit: String?
    public let mealTitle: String
    public let date: CivilDate
    public let slot: MealSlot
    public let name: String
    public let categoryId: UUID?
    public let groceryItemId: UUID?

    public var id: MealIngredientSource { .init(entryId: entryId, ingredientId: ingredientId) }
}

public struct SkippedMealIngredients: Codable, Equatable, Sendable {
    public enum Reason: String, Codable, Sendable {
        case noRecipe = "no_recipe"
        case noIngredients = "no_ingredients"
        case leftovers
    }
    public let entryId: UUID
    public let reason: Reason
}

public struct MealIngredientPage: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let ingredients: [MealIngredient]
    public let skipped: [SkippedMealIngredients]
    public let nextAfter: MealIngredientSource?

    func validated(household: UUID, week: MealWeekStart, revision expected: String, after: MealIngredientSource?) throws
        -> Self
    {
        guard version == 1, householdId == household, weekStart == week,
            MealRevision.valid(revision), revision == expected,
            ingredients.count <= 100, skipped.count <= 21,
            Set(skipped.map(\.entryId)).count == skipped.count,
            nextAfter == nil || (ingredients.count == 100 && nextAfter == ingredients.last?.id)
        else { throw MealLibraryError.invalidResponse }
        let skippedIds = Set(skipped.map(\.entryId))
        let added = ingredients.compactMap(\.groceryItemId)
        guard Set(added).count == added.count else { throw MealLibraryError.invalidResponse }
        var previous = after?.key
        var meals: [UUID: MealIngredient] = [:]
        for row in ingredients {
            guard previous.map({ row.id.key > $0 }) ?? true,
                !skippedIds.contains(row.entryId), week.days.contains(row.date),
                MealLibraryText.validTitle(row.name), MealLibraryText.validTitle(row.mealTitle),
                MealLibraryText.valid(row.quantity, maximum: 80), MealLibraryText.valid(row.unit, maximum: 80)
            else { throw MealLibraryError.invalidResponse }
            if let meal = meals[row.entryId] {
                guard meal.mealTitle == row.mealTitle, meal.date == row.date, meal.slot == row.slot
                else { throw MealLibraryError.invalidResponse }
            }
            meals[row.entryId] = row
            previous = row.id.key
        }
        return self
    }
}

struct ReadMealIngredients: Encodable {
    let weekStart: MealWeekStart
    let expectedRevision: String
    let after: MealIngredientSource?

    enum CodingKeys: String, CodingKey { case weekStart, expectedRevision, after }

    func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(weekStart, forKey: .weekStart)
        try fields.encode(expectedRevision, forKey: .expectedRevision)
        try fields.encode(after, forKey: .after)
    }
}
