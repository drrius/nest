import Foundation

public struct RoutineStateCommand: Codable, Equatable, Sendable {
    public enum Action: String, Codable, Sendable { case pause, resume, archive }
    public let operationId: UUID
    public let routineId: UUID
    public let expectedVersion: String
    public let action: Action

    public func validated() throws -> Self {
        guard ApprovalTime.date(expectedVersion) != nil else { throw ChoreContractError.invalidSnapshot }
        return self
    }
}

extension RoutineCreateReceipt {
    func validated(member: VerifiedMember, command: RoutineStateCommand) throws -> Self {
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, routineId == command.routineId,
            action == command.action.rawValue, ApprovalTime.date(version) != nil
        else { throw ChoreContractError.invalidReceipt }
        return self
    }
}

extension ChoreAPI {
    public func setRoutineState(token: String, member: VerifiedMember, command: RoutineStateCommand) async throws
        -> RoutineCreateReceipt
    {
        let result = try await http.write(
            "v1/routines/state", token: token, household: member.householdId,
            body: command.validated(), as: RoutineCreateEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }
}
