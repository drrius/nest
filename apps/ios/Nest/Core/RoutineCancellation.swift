import Foundation

public struct RoutineCancellation: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case recorded, cancelled }
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let status: Status
    public let receipt: RoutineCreateReceipt?

    public func validated(member: VerifiedMember, command: CreateRoutine) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw ChoreContractError.invalidReceipt }
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreAPI {
    public func cancelRoutineCreation(token: String, member: VerifiedMember, command: CreateRoutine) async throws
        -> RoutineCancellation
    {
        let result = try await http.write(
            "v1/routines/cancel-create", token: token, household: member.householdId,
            body: command.validated(), as: RoutineCancellation.self)
        return try result.validated(member: member, command: command)
    }
}
