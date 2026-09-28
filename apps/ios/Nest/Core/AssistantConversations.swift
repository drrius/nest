import Foundation

struct AssistantConversationSummary: Codable, Identifiable, Sendable {
    let conversationId: UUID
    let revision: String
    let createdAt: String
    let updatedAt: String
    var id: UUID { conversationId }
}

struct AssistantConversationPage: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let conversations: [AssistantConversationSummary]
    let nextCursor: UUID?

    func validated(member: VerifiedMember, after: UUID?) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            conversations.count <= 20, Set(conversations.map(\.id)).count == conversations.count,
            !conversations.contains(where: { $0.id == after }),
            nextCursor == nil || (conversations.count == 20 && nextCursor == conversations.last?.id)
        else { throw NestAPIFailure.contract }
        for conversation in conversations {
            guard MealRevision.valid(conversation.revision),
                AssistantTimestamp.date(conversation.createdAt) != nil,
                AssistantTimestamp.date(conversation.updatedAt) != nil
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

/// The conversation API accepts offset timestamps and one to six fractional digits.
enum AssistantTimestamp {
    static func date(_ value: String) -> Date? {
        guard
            value.range(
                of:
                    #"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})\z"#,
                options: .regularExpression) != nil
        else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        if value.contains(".") { formatter.formatOptions.insert(.withFractionalSeconds) }
        return formatter.date(from: value)
    }
}

struct AssistantAPI: Sendable {
    let http: NestHTTP

    func conversations(token: String, member: VerifiedMember, after: UUID?) async throws -> AssistantConversationPage {
        let query = after.map { "?cursor=\($0.uuidString.lowercased())" } ?? ""
        let page = try await http.read(
            "v1/assistant/conversations\(query)", token: token, household: member.householdId,
            as: AssistantConversationPage.self)
        return try page.validated(member: member, after: after)
    }
}
