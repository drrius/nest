import Foundation

struct StartAssistantTurn: Codable, Equatable, Sendable {
    let conversationId: UUID
    let operationId: UUID
    let expectedRevision: String
    let text: String

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max,
            !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, text.utf16.count <= 2_000
        else { throw NestAPIFailure.invalid }
        return self
    }
}

struct AssistantTurnIdentity: Codable, Equatable, Sendable {
    let conversationId: UUID
    let operationId: UUID
}

struct AssistantTurnReceipt: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case running, completed, interrupted }
    let claimed: Bool
    let state: State
    let assistantId: UUID
    let inputRevision: String
    let finalRevision: String?
    let deadline: String

    func validated(command: StartAssistantTurn) throws {
        _ = try command.validated()
        guard let expected = Int64(command.expectedRevision), inputRevision == String(expected + 1),
            AssistantTimestamp.date(deadline) != nil
        else { throw NestAPIFailure.contract }
        if state == .running {
            guard finalRevision == nil else { throw NestAPIFailure.contract }
        } else {
            guard !claimed, let finalRevision, MealRevision.valid(finalRevision),
                let final = Int64(finalRevision), final > expected + 1
            else { throw NestAPIFailure.contract }
        }
    }
}

struct AssistantTurnEnvelope: Codable, Equatable, Sendable {
    let version: Int
    let conversationId: UUID
    let operationId: UUID
    let turn: AssistantTurnReceipt

    func validated(command: StartAssistantTurn) throws -> Self {
        guard version == 1, conversationId == command.conversationId, operationId == command.operationId else {
            throw NestAPIFailure.contract
        }
        try turn.validated(command: command)
        return self
    }
}

extension AssistantAPI {
    func turn(token: String, member: VerifiedMember, command: StartAssistantTurn) async throws -> AssistantTurnEnvelope
    {
        let query =
            "conversationId=\(command.conversationId.uuidString.lowercased())&operationId=\(command.operationId.uuidString.lowercased())"
        let value = try await http.read(
            "v1/assistant/turn?\(query)", token: token, household: member.householdId, as: AssistantTurnEnvelope.self)
        return try value.validated(command: command)
    }

    func interrupt(token: String, member: VerifiedMember, command: StartAssistantTurn) async throws
        -> AssistantTurnEnvelope
    {
        let value = try await http.write(
            "v1/assistant/interrupt", token: token, household: member.householdId,
            body: AssistantTurnIdentity(conversationId: command.conversationId, operationId: command.operationId),
            as: AssistantTurnEnvelope.self)
        return try value.validated(command: command)
    }
}
