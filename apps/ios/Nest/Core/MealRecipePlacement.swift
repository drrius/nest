import Foundation

public struct PlaceSavedRecipe: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let date: CivilDate
    public let slot: MealSlot
    public let definitionId: UUID
    public let expectedLibraryRevision: String

    public init(
        week: MealWeekSnapshot, recipe: SavedRecipe, libraryRevision: String,
        operationId: UUID, date: CivilDate, slot: MealSlot
    ) throws {
        _ = try recipe.validated()
        guard MealRevision.valid(week.revision), MealRevision.valid(libraryRevision),
            week.weekStart.days.contains(date),
            !week.entries.contains(where: { $0.date == date && $0.slot == slot })
        else { throw MealContractError.invalidPlacement }
        self.operationId = operationId
        weekStart = week.weekStart
        expectedRevision = week.revision
        self.date = date
        self.slot = slot
        definitionId = recipe.id
        expectedLibraryRevision = libraryRevision
    }

    func validated(against week: MealWeekSnapshot, recipe: SavedRecipe) throws -> Self {
        guard
            self
                == (try PlaceSavedRecipe(
                    week: week, recipe: recipe, libraryRevision: expectedLibraryRevision,
                    operationId: operationId, date: date, slot: slot))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealRecipePlacementReceipt: Decodable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let date: CivilDate
    public let slot: MealSlot
    public let revision: String
    public let definitionId: UUID
    public let libraryRevision: String

    func validated(member: VerifiedMember, command: PlaceSavedRecipe) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, weekStart == command.weekStart,
            date == command.date, slot == command.slot,
            definitionId == command.definitionId,
            libraryRevision == command.expectedLibraryRevision,
            let previous = Int64(command.expectedRevision), previous < Int64.max,
            revision == String(previous + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

public struct MealRecipePlacementEnvelope: Decodable, Sendable {
    public let version: Int
    public let receipt: MealRecipePlacementReceipt

    func validated(
        member: VerifiedMember, command: PlaceSavedRecipe
    ) throws -> MealRecipePlacementReceipt {
        guard version == 1 else { throw MealContractError.invalidReceipt }
        return try receipt.validated(member: member, command: command)
    }
}
