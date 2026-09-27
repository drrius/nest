import Foundation

public struct PlaceMeal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let date: CivilDate
    public let slot: MealSlot
    public let title: String

    public init(
        week: MealWeekSnapshot, operationId: UUID, date: CivilDate,
        slot: MealSlot, title: String
    ) throws {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard MealRevision.valid(week.revision), week.weekStart.days.contains(date),
            !week.entries.contains(where: { $0.date == date && $0.slot == slot }),
            !trimmed.isEmpty, trimmed.unicodeScalars.count <= 120,
            !trimmed.contains("\0")
        else { throw MealContractError.invalidPlacement }
        self.operationId = operationId
        weekStart = week.weekStart
        expectedRevision = week.revision
        self.date = date
        self.slot = slot
        self.title = trimmed
    }

    func validated(against week: MealWeekSnapshot) throws -> Self {
        guard
            self
                == (try PlaceMeal(
                    week: week, operationId: operationId, date: date, slot: slot, title: title))
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealPlacementReceipt: Decodable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let date: CivilDate
    public let slot: MealSlot
    public let revision: String

    func validated(member: VerifiedMember, command: PlaceMeal) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, weekStart == command.weekStart,
            date == command.date, slot == command.slot,
            let previous = Int64(command.expectedRevision), previous < Int64.max,
            revision == String(previous + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

public struct MealPlacementEnvelope: Decodable, Sendable {
    public let version: Int
    public let receipt: MealPlacementReceipt

    func validated(member: VerifiedMember, command: PlaceMeal) throws -> MealPlacementReceipt {
        guard version == 1 else { throw MealContractError.invalidReceipt }
        return try receipt.validated(member: member, command: command)
    }
}
