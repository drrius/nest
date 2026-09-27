import Foundation

public struct ReplaceMeal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let date: CivilDate
    public let slot: MealSlot
    public let title: String

    public init(week: MealWeekSnapshot, meal: PlannedMeal, operationId: UUID, title: String) throws {
        _ = try week.validated(household: week.householdId, week: week.weekStart)
        guard week.entries.contains(meal), let revision = Int64(week.revision),
            revision <= Int64.max - 2
        else { throw MealContractError.invalidPlacement }
        let available = MealWeekSnapshot(
            version: week.version, householdId: week.householdId,
            weekStart: week.weekStart, revision: week.revision, entries: week.entries.filter { $0.id != meal.id })
        let placement = try PlaceMeal(
            week: available, operationId: operationId,
            date: meal.date, slot: meal.slot, title: title)
        self.operationId = operationId
        entryId = meal.id
        weekStart = week.weekStart
        expectedRevision = week.revision
        date = meal.date
        slot = meal.slot
        self.title = placement.title
    }

    func validated(week: MealWeekSnapshot, meal: PlannedMeal) throws -> Self {
        guard self == (try ReplaceMeal(week: week, meal: meal, operationId: operationId, title: title))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealReplacementReceipt: Codable, Equatable, Sendable {
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
    public let skippedPreparationId: UUID?

    func validated(member: VerifiedMember, command: ReplaceMeal) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, previousEntryId == command.entryId,
            entryId != previousEntryId, weekStart == command.weekStart,
            date == command.date, slot == command.slot,
            let previous = Int64(command.expectedRevision), previous <= Int64.max - 2,
            revision == String(previous + 2)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct MealReplacementEnvelope: Decodable {
    let version: Int
    let receipt: MealReplacementReceipt
}
