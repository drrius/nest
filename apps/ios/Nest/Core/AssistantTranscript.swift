import Foundation

struct AssistantMessage: Decodable, Identifiable, Sendable {
    enum Role: String, Decodable, Sendable { case user, assistant }
    let id: String
    let role: Role
    let parts: [[String: AssistantJSON]]
}

struct AssistantTranscript: Decodable, Sendable {
    let conversationId: UUID
    let revision: String
    let messages: [AssistantMessage]

    func validated(id: UUID) throws -> Self {
        guard conversationId == id, MealRevision.valid(revision), messages.count <= 1_000,
            Set(messages.map(\.id)).count == messages.count
        else { throw NestAPIFailure.contract }
        for message in messages {
            guard !message.id.isEmpty,
                message.parts.allSatisfy({ part in
                    guard let type = part["type"]?.string, !type.isEmpty else { return false }
                    return type != "text" || part["text"]?.string != nil
                })
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

struct AssistantTranscriptEnvelope: Decodable, Sendable {
    let version: Int
    let conversation: AssistantTranscript?

    func validated(id: UUID) throws -> Self {
        guard version == 1 else { throw NestAPIFailure.contract }
        _ = try conversation?.validated(id: id)
        return self
    }
}

extension AssistantAPI {
    func transcript(token: String, member: VerifiedMember, id: UUID) async throws -> AssistantTranscriptEnvelope {
        // The server allows a 2 MiB transcript, plus its envelope. Other reads retain their smaller default.
        let value = try await http.read(
            "v1/assistant/conversation?id=\(id.uuidString.lowercased())", token: token,
            household: member.householdId, responseLimit: 3_000_000, as: AssistantTranscriptEnvelope.self)
        return try value.validated(id: id)
    }
}
