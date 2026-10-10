import Foundation

struct AssistantCancellation: Decodable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let conversationId: UUID
    let operationId: UUID
    let cancelled: Bool

    func validated(member: VerifiedMember, command: StartAssistantTurn) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            conversationId == command.conversationId, operationId == command.operationId
        else {
            throw NestAPIFailure.contract
        }
        return self
    }
}

extension AssistantAPI {
    func cancel(token: String, member: VerifiedMember, command: StartAssistantTurn) async throws
        -> AssistantCancellation
    {
        let result = try await http.write(
            "v1/assistant/cancel", token: token, household: member.householdId,
            body: AssistantTurnIdentity(conversationId: command.conversationId, operationId: command.operationId),
            as: AssistantCancellation.self)
        return try result.validated(member: member, command: command)
    }
}

extension ChoreOfflineStore {
    func requestAssistantCancellation(lease: OfflineLease) throws {
        guard var saved = try readAssistantTurn(lease: lease), !saved.terminal else {
            throw OfflineFailure.invalidOperation
        }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE assistant_turns SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmAssistantCancellation(_ result: AssistantCancellation, member: VerifiedMember, lease: OfflineLease)
        throws
    {
        guard let saved = try readAssistantTurn(lease: lease), saved.cancellationRequested == true,
            saved.result == nil, result.cancelled
        else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: member, command: saved.command)
        try db.run("DELETE FROM assistant_turns WHERE actor=? AND household=?", lease.scope)
    }
}
