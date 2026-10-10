import Foundation

public struct ReplaceSavedRecipe: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let date: CivilDate
    public let slot: MealSlot
    public let definitionId: UUID
    public let expectedLibraryRevision: String

    public init(
        week: MealWeekSnapshot, meal: PlannedMeal, recipe: SavedRecipe,
        libraryRevision: String, operationId: UUID
    ) throws {
        _ = try week.validated(household: week.householdId, week: week.weekStart)
        _ = try recipe.validated()
        guard week.entries.contains(meal), MealRevision.valid(libraryRevision),
            let revision = Int64(week.revision), revision <= Int64.max - 2
        else { throw MealContractError.invalidPlacement }
        self.operationId = operationId
        entryId = meal.id
        weekStart = week.weekStart
        expectedRevision = week.revision
        date = meal.date
        slot = meal.slot
        definitionId = recipe.id
        expectedLibraryRevision = libraryRevision
    }

    func validated(week: MealWeekSnapshot, meal: PlannedMeal, recipe: SavedRecipe) throws -> Self {
        guard
            self
                == (try ReplaceSavedRecipe(
                    week: week, meal: meal, recipe: recipe,
                    libraryRevision: expectedLibraryRevision, operationId: operationId))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealRecipeReplacementReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let previousEntryId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let date: CivilDate
    public let slot: MealSlot
    public let revision: String
    public let definitionId: UUID
    public let libraryRevision: String
    public let skippedPreparationId: UUID?

    func validated(member: VerifiedMember, command: ReplaceSavedRecipe) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, previousEntryId == command.entryId, entryId != previousEntryId,
            weekStart == command.weekStart, date == command.date, slot == command.slot,
            definitionId == command.definitionId, libraryRevision == command.expectedLibraryRevision,
            MealRevision.valid(command.expectedRevision), MealRevision.valid(libraryRevision),
            let previous = Int64(command.expectedRevision), previous <= Int64.max - 2,
            revision == String(previous + 2), weekStart.days.contains(date)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct MealRecipeReplacementEnvelope: Decodable {
    let version: Int
    let receipt: MealRecipeReplacementReceipt
}
