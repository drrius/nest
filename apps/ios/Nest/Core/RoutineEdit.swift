import Foundation

public struct RoutinePatch: Codable, Equatable, Sendable {
    public let title: String?
    public let schedule: RoutineSchedule?
    public let assignment: RoutineAssignment?

    public func validated() throws -> Self {
        guard title != nil || schedule != nil || assignment != nil else {
            throw ChoreContractError.invalidSnapshot
        }
        if let title {
            guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                title.utf16.count <= 120, !title.contains("\0")
            else { throw ChoreContractError.invalidSnapshot }
        }
        if let schedule { _ = try schedule.validated() }
        return self
    }
}

public struct EditRoutine: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let routineId: UUID
    public let expectedVersion: String
    public let patch: RoutinePatch

    public func validated() throws -> Self {
        guard ApprovalTime.date(expectedVersion) != nil else { throw ChoreContractError.invalidSnapshot }
        _ = try patch.validated()
        return self
    }
}

extension RoutineCreateReceipt {
    func validated(member: VerifiedMember, command: EditRoutine) throws -> Self {
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, routineId == command.routineId,
            action == "edit", ApprovalTime.date(version) != nil
        else { throw ChoreContractError.invalidReceipt }
        return self
    }
}

extension ChoreAPI {
    public func editRoutine(token: String, member: VerifiedMember, command: EditRoutine) async throws
        -> RoutineCreateReceipt
    {
        let result = try await http.write(
            "v1/routines/edit", token: token, household: member.householdId,
            body: command.validated(), as: RoutineCreateEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }
}
