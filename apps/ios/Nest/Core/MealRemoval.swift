import Foundation

public struct RemoveMeal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String

    public init(week: MealWeekSnapshot, meal: PlannedMeal, operationId: UUID) throws {
        guard week.entries.contains(meal), MealRevision.valid(week.revision)
        else { throw MealContractError.invalidPlacement }
        self.operationId = operationId
        entryId = meal.id
        weekStart = week.weekStart
        expectedRevision = week.revision
    }

    func validated(against week: MealWeekSnapshot, meal: PlannedMeal) throws -> Self {
        guard self == (try RemoveMeal(week: week, meal: meal, operationId: operationId))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealRemovalReceipt: Decodable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let removed: Bool
    public let skippedPreparationId: UUID?

    func validated(member: VerifiedMember, command: RemoveMeal) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, entryId == command.entryId,
            weekStart == command.weekStart, removed,
            let previous = Int64(command.expectedRevision), previous < Int64.max,
            revision == String(previous + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

public struct MealRemovalEnvelope: Decodable, Sendable {
    public let version: Int
    public let receipt: MealRemovalReceipt

    func validated(member: VerifiedMember, command: RemoveMeal) throws -> MealRemovalReceipt {
        guard version == 1 else { throw MealContractError.invalidReceipt }
        return try receipt.validated(member: member, command: command)
    }
}
