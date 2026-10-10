import Foundation

public struct RetainedRecipe: Codable, Equatable, Sendable {
    public let definitionId: UUID?
    public let title: String
    public let servings: Int?
    public let recipeUrl: String?
    public let notes: String?
    public let instructions: String?
    public let ingredients: [SavedIngredient]

    public var content: RecipeContent {
        RecipeContent(
            title: title, servings: servings, recipeUrl: recipeUrl,
            notes: notes, instructions: instructions, ingredients: ingredients)
    }
}

public struct PlannedRecipeSnapshot: Codable, Equatable, Sendable {
    public let libraryRevision: String?
    public let recipe: RetainedRecipe

    func validated(entry: PlannedMeal) throws -> Self {
        _ = try recipe.content.validated()
        guard recipe.definitionId == entry.definitionId, recipe.title == entry.title,
            recipe.recipeUrl == entry.recipeUrl, recipe.notes == entry.notes
        else { throw MealLibraryError.invalidResponse }
        if recipe.definitionId != nil {
            guard let libraryRevision, MealRevision.valid(libraryRevision)
            else { throw MealLibraryError.invalidResponse }
        } else {
            guard libraryRevision == nil, !recipe.ingredients.isEmpty
            else { throw MealLibraryError.invalidResponse }
        }
        return self
    }
}

public struct PlannedRecipeEnvelope: Codable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let entry: PlannedMeal?
    public let snapshot: PlannedRecipeSnapshot?

    func validated(household: UUID, start: MealWeekStart, id: UUID) throws -> Self {
        guard version == 1, householdId == household, weekStart == start,
            MealRevision.valid(revision), entry == nil || entry?.id == id
        else { throw MealLibraryError.invalidResponse }
        if let entry {
            _ = try MealWeekSnapshot(
                version: 1, householdId: household, weekStart: start,
                revision: revision, entries: [entry]
            ).validated(household: household, week: start)
            _ = try snapshot?.validated(entry: entry)
        } else if snapshot != nil {
            throw MealLibraryError.invalidResponse
        }
        return self
    }

    func validated(against week: MealWeekSnapshot, id: UUID) throws -> Self {
        _ = try week.validated(household: week.householdId, week: week.weekStart)
        _ = try validated(household: week.householdId, start: week.weekStart, id: id)
        guard revision == week.revision, entry == week.entries.first(where: { $0.id == id })
        else { throw MealLibraryError.invalidResponse }
        return self
    }
}
