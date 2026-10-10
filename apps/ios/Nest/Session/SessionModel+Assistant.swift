import Foundation

struct AssistantContext {
    let member: VerifiedMember
    let generation: Int
}

extension SessionModel {
    func assistantContext() throws -> AssistantContext {
        guard case .ready(let member) = status else { throw NestAPIFailure.signedOut }
        return AssistantContext(member: member, generation: generation)
    }

    func readConversations(_ context: AssistantContext, after: UUID?) async throws -> AssistantConversationPage {
        let token = try await assistantToken(context)
        guard let assistantAPI else { throw NestAPIFailure.configuration }
        let result = try await assistantAPI.conversations(token: token, member: context.member, after: after)
        try requireAssistantAccount(context)
        return result
    }

    func readConversation(_ context: AssistantContext, id: UUID) async throws -> AssistantTranscriptEnvelope {
        let token = try await assistantToken(context)
        guard let assistantAPI else { throw NestAPIFailure.configuration }
        let result = try await assistantAPI.transcript(token: token, member: context.member, id: id)
        try requireAssistantAccount(context)
        return result
    }

    func requireAssistantAccount(_ context: AssistantContext) throws {
        guard generation == context.generation, status == .ready(context.member) else {
            throw NestAPIFailure.signedOut
        }
    }

    func assistantToken(_ context: AssistantContext) async throws -> String {
        try requireAssistantAccount(context)
        guard let auth else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireAssistantAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}
