import Foundation

public struct PlaceLeftovers: Codable, Equatable, Sendable {
    public let command: MoveMeal

    public init(
        source: MealWeekSnapshot, target: MealWeekSnapshot, meal: PlannedMeal,
        operationId: UUID, date: CivilDate, slot: MealSlot
    ) throws {
        guard meal.leftoverSourceId == nil, meal.date.value < date.value else {
            throw MealContractError.invalidPlacement
        }
        command = try MoveMeal(
            source: source, target: target, meal: meal,
            operationId: operationId, date: date, slot: slot)
    }

    public init(from decoder: Decoder) throws { command = try MoveMeal(from: decoder) }
    public func encode(to encoder: Encoder) throws { try command.encode(to: encoder) }

    func validated(source: MealWeekSnapshot, target: MealWeekSnapshot, meal: PlannedMeal) throws -> Self {
        guard
            self
                == (try PlaceLeftovers(
                    source: source, target: target, meal: meal,
                    operationId: command.operationId, date: command.date, slot: command.slot))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct LeftoverPlacementReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let sourceEntryId: UUID
    public let sourceWeekStart: MealWeekStart
    public let targetWeekStart: MealWeekStart
    public let sourceRevision: String
    public let targetRevision: String
    public let date: CivilDate
    public let slot: MealSlot

    func validated(member: VerifiedMember, placement: PlaceLeftovers) throws -> Self {
        let command = placement.command
        let delta: Int64 = command.sourceWeekStart == command.targetWeekStart ? 1 : 0
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, sourceEntryId == command.entryId, entryId != sourceEntryId,
            sourceWeekStart == command.sourceWeekStart, targetWeekStart == command.targetWeekStart,
            date == command.date, slot == command.slot,
            let source = Int64(command.expectedSourceRevision), source <= Int64.max - delta,
            let target = Int64(command.expectedTargetRevision), target < Int64.max,
            sourceRevision == String(source + delta), targetRevision == String(target + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct LeftoverPlacementEnvelope: Decodable {
    let version: Int
    let receipt: LeftoverPlacementReceipt
}
