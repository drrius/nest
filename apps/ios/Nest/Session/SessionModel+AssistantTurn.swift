import Foundation

struct AssistantTurnContext {
    let account: AssistantContext
    let lease: OfflineLease
}

extension SessionModel {
    func assistantTurnContext() throws -> AssistantTurnContext {
        let account = try assistantContext()
        guard let lease else { throw NestAPIFailure.signedOut }
        return .init(account: account, lease: lease)
    }

    func savedAssistantTurn(_ context: AssistantTurnContext) async throws -> SavedAssistantTurn? {
        try requireAssistantAccount(context.account)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readAssistantTurn(lease: context.lease)
        try requireAssistantAccount(context.account)
        return saved
    }

    func stageAssistantTurn(_ command: StartAssistantTurn, context: AssistantTurnContext) async throws {
        _ = try command.validated()
        let token = try await assistantToken(context.account)
        guard let assistantAPI else { throw NestAPIFailure.configuration }
        try await assistantAPI.requireAvailable(token: token, member: context.account.member)
        try requireAssistantAccount(context.account)
        // An authorized network read must succeed before retaining a send attempt.
        let current = try await readConversation(context.account, id: command.conversationId)
        guard (current.conversation?.revision ?? "0") == command.expectedRevision else {
            throw NestAPIFailure.conflict
        }
        try requireAssistantAccount(context.account)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.saveAssistantTurn(command, lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func recoverAssistantTurn(_ context: AssistantTurnContext, interrupt: Bool = false) async throws
        -> SavedAssistantTurn
    {
        guard let saved = try await savedAssistantTurn(context), let assistantAPI, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.terminal { return saved }
        let token = try await assistantToken(context.account)
        let result: AssistantTurnEnvelope
        if interrupt {
            result = try await assistantAPI.interrupt(
                token: token, member: context.account.member, command: saved.command)
        } else {
            result = try await assistantAPI.turn(token: token, member: context.account.member, command: saved.command)
        }
        try requireAssistantAccount(context.account)
        try await offline.recordAssistantTurn(result, lease: context.lease)
        guard let recovered = try await savedAssistantTurn(context) else { throw OfflineFailure.invalidOperation }
        return recovered
    }

    func sendSavedAssistantTurn(
        _ context: AssistantTurnContext,
        receive: @escaping @MainActor @Sendable (AssistantStreamFrame) throws -> Void
    ) async throws {
        guard let saved = try await savedAssistantTurn(context), !saved.terminal, saved.cancellationRequested != true,
            let assistantAPI
        else {
            throw OfflineFailure.invalidOperation
        }
        let token = try await assistantToken(context.account)
        try await assistantAPI.stream(
            command: saved.command, token: token, household: context.account.member.householdId
        ) {
            [weak self] frame in
            try await self?.deliverAssistantFrame(frame, context: context, receive: receive)
        }
        try requireAssistantAccount(context.account)
        _ = try await recoverAssistantTurn(context)
    }

    func finishAssistantTurn(_ context: AssistantTurnContext, operation: UUID) async throws {
        try requireAssistantAccount(context.account)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishAssistantTurn(operation: operation, lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func cancelAssistantTurn(_ context: AssistantTurnContext) async throws -> Bool {
        try requireAssistantAccount(context.account)
        guard let offline, let assistantAPI else { throw NestAPIFailure.configuration }
        try await offline.requestAssistantCancellation(lease: context.lease)
        guard let saved = try await savedAssistantTurn(context) else { throw OfflineFailure.invalidOperation }
        let token = try await assistantToken(context.account)
        let result = try await assistantAPI.cancel(token: token, member: context.account.member, command: saved.command)
        try requireAssistantAccount(context.account)
        if result.cancelled {
            try await offline.confirmAssistantCancellation(result, member: context.account.member, lease: context.lease)
        }
        try requireAssistantAccount(context.account)
        return result.cancelled
    }

    private func deliverAssistantFrame(
        _ frame: AssistantStreamFrame, context: AssistantTurnContext,
        receive: @MainActor @Sendable (AssistantStreamFrame) throws -> Void
    ) throws {
        try requireAssistantAccount(context.account)
        try receive(frame)
    }
}
