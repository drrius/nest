import Foundation

public struct MoveMeal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let entryId: UUID
    public let sourceWeekStart: MealWeekStart
    public let expectedSourceRevision: String
    public let targetWeekStart: MealWeekStart
    public let expectedTargetRevision: String
    public let date: CivilDate
    public let slot: MealSlot

    public init(
        source: MealWeekSnapshot, target: MealWeekSnapshot, meal: PlannedMeal,
        operationId: UUID, date: CivilDate, slot: MealSlot
    ) throws {
        _ = try source.validated(household: source.householdId, week: source.weekStart)
        _ = try target.validated(household: source.householdId, week: target.weekStart)
        guard source.entries.contains(meal), target.weekStart.days.contains(date),
            source.weekStart != target.weekStart || source == target,
            meal.date != date || meal.slot != slot,
            !target.entries.contains(where: { $0.date == date && $0.slot == slot }),
            let sourceRevision = Int64(source.revision), sourceRevision < Int64.max,
            let targetRevision = Int64(target.revision), targetRevision < Int64.max
        else { throw MealContractError.invalidPlacement }
        self.operationId = operationId
        entryId = meal.id
        sourceWeekStart = source.weekStart
        expectedSourceRevision = source.revision
        targetWeekStart = target.weekStart
        expectedTargetRevision = target.revision
        self.date = date
        self.slot = slot
    }

    func validated(source: MealWeekSnapshot, target: MealWeekSnapshot, meal: PlannedMeal) throws -> Self {
        guard
            self
                == (try MoveMeal(
                    source: source, target: target, meal: meal,
                    operationId: operationId, date: date, slot: slot))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealMoveReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let sourceWeekStart: MealWeekStart
    public let targetWeekStart: MealWeekStart
    public let sourceRevision: String
    public let targetRevision: String
    public let date: CivilDate
    public let slot: MealSlot

    func validated(member: VerifiedMember, command: MoveMeal) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, entryId == command.entryId,
            sourceWeekStart == command.sourceWeekStart, targetWeekStart == command.targetWeekStart,
            date == command.date, slot == command.slot,
            let source = Int64(command.expectedSourceRevision), source < Int64.max,
            let target = Int64(command.expectedTargetRevision), target < Int64.max,
            sourceRevision == String(source + 1), targetRevision == String(target + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct MealMoveEnvelope: Decodable {
    let version: Int
    let receipt: MealMoveReceipt
}
