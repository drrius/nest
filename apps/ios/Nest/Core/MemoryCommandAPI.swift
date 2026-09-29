import Foundation

extension AssistantAPI {
    func proposeMemory(token: String, member: VerifiedMember, command: ProposeMemory) async throws
        -> MemoryApprovalEnvelope
    {
        _ = try command.change.validated()
        let result = try await http.write(
            "v1/memories/propose", token: token, household: member.householdId, body: command,
            as: MemoryApprovalEnvelope.self)
        _ = try result.validated(member: member, id: result.approval.id)
        guard result.approval.operationId == command.operationId, result.approval.change == command.change else {
            throw NestAPIFailure.contract
        }
        return result
    }

    func decideMemory(token: String, member: VerifiedMember, command: DecideMemory) async throws
        -> MemoryDecisionEnvelope
    {
        _ = try MemoryChange(
            memoryId: command.memoryId, expectedRevision: command.expectedRevision, content: command.content).validated()
        let result = try await http.write(
            "v1/memories/decide", token: token, household: member.householdId, body: command,
            as: MemoryDecisionEnvelope.self)
        return try result.validated(member: member, command: command)
    }

    func removeMemory(token: String, member: VerifiedMember, command: RemoveMemory) async throws
        -> MemoryRemovalEnvelope
    {
        guard MealRevision.valid(command.expectedRevision), command.expectedRevision != "0" else {
            throw NestAPIFailure.invalid
        }
        let result = try await http.write(
            "v1/memories/remove", token: token, household: member.householdId, body: command,
            as: MemoryRemovalEnvelope.self)
        return try result.validated(member: member, command: command)
    }
}
