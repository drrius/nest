import Foundation

public struct MealPreparationReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let entryId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let routineId: UUID
    public let occurrenceId: UUID
    public let routineVersion: String
    public let dueOn: CivilDate
    public let previousRoutineVersion: String?

    func validated(member: VerifiedMember, command: CreateMealPreparation) throws -> Self {
        _ = try command.validated()
        try validateIdentity(
            member: member, operation: command.operationId, entry: command.entryId, week: command.weekStart,
            revision: command.expectedRevision)
        guard dueOn == command.preparation.dueOn, previousRoutineVersion == nil else {
            throw MealContractError.invalidReceipt
        }
        return self
    }

    func validated(member: VerifiedMember, command: EditMealPreparation) throws -> Self {
        _ = try command.validated()
        try validateIdentity(
            member: member, operation: command.operationId, entry: command.entryId, week: command.weekStart,
            revision: command.expectedRevision)
        guard routineId == command.routineId, previousRoutineVersion == command.expectedRoutineVersion,
            routineVersion > command.expectedRoutineVersion, command.patch.dueOn == nil || dueOn == command.patch.dueOn
        else { throw MealContractError.invalidReceipt }
        return self
    }

    private func validateIdentity(
        member: VerifiedMember, operation: UUID, entry: UUID, week: MealWeekStart, revision expected: String
    ) throws {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == operation, entryId == entry, weekStart == week, revision == expected,
            ApprovalTime.date(routineVersion) != nil
        else { throw MealContractError.invalidReceipt }
    }
}

struct MealPreparationWriteEnvelope: Decodable {
    let version: Int
    let receipt: MealPreparationReceipt
}
