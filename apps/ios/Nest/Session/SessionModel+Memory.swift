import Foundation

extension SessionModel {
    func readMemories(_ context: AssistantContext) async throws -> PrivateMemories {
        let token = try await assistantToken(context)
        guard let assistantAPI else { throw NestAPIFailure.configuration }
        let result = try await assistantAPI.memories(token: token, member: context.member)
        try requireAssistantAccount(context)
        return result
    }

    func readMemoryApproval(_ context: AssistantContext, id: UUID) async throws -> MemoryApprovalEnvelope {
        let token = try await assistantToken(context)
        guard let assistantAPI else { throw NestAPIFailure.configuration }
        let result = try await assistantAPI.memoryApproval(token: token, member: context.member, id: id)
        try requireAssistantAccount(context)
        return result
    }
}
