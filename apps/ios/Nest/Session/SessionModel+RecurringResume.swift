import Foundation

extension SessionModel {
    func savedRecurringResume(_ context: ExpenseContext) async throws -> SavedRecurringResume? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurringResume(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurringResume(_ change: RecurringResumeInput, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurringResume(.init(operationId: UUID(), change: change), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurringResume(_ context: ExpenseContext) async throws -> SavedRecurringResume {
        guard let saved = try await savedRecurringResume(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedRecurringResume(context, saved: saved, token: token)
        }
        let recovered = try await moneyAPI.recoverRecurringResume(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringResume(recovered, lease: context.lease)
        guard let current = try await savedRecurringResume(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedRecurringResume(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveRecurringResume(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmRecurringResume(receipt, lease: context.lease)
        guard let confirmed = try await savedRecurringResume(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelRecurringResume(_ context: ExpenseContext) async throws -> SavedRecurringResume {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRecurringResumeCancellation(lease: context.lease)
        return try await retryRecurringResume(context)
    }

    func finishRecurringResume(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurringResume(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedRecurringResume(_ context: ExpenseContext, saved: SavedRecurringResume, token: String)
        async throws
        -> SavedRecurringResume
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelRecurringResume(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringResume(result, lease: context.lease)
        guard let confirmed = try await savedRecurringResume(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
