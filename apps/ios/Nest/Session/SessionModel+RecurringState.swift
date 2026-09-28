import Foundation

extension SessionModel {
    func savedRecurringState(_ context: ExpenseContext) async throws -> SavedRecurringState? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurringState(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurringState(_ change: RecurringStateInput, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurringState(.init(operationId: UUID(), change: change), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurringState(_ context: ExpenseContext) async throws -> SavedRecurringState {
        guard let saved = try await savedRecurringState(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedRecurringState(context, saved: saved, token: token)
        }
        let recovered = try await moneyAPI.recoverRecurringState(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringState(recovered, lease: context.lease)
        guard let current = try await savedRecurringState(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedRecurringState(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveRecurringState(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmRecurringState(receipt, lease: context.lease)
        guard let confirmed = try await savedRecurringState(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelRecurringState(_ context: ExpenseContext) async throws -> SavedRecurringState {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRecurringStateCancellation(lease: context.lease)
        return try await retryRecurringState(context)
    }

    func finishRecurringState(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurringState(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedRecurringState(_ context: ExpenseContext, saved: SavedRecurringState, token: String)
        async throws
        -> SavedRecurringState
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelRecurringState(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringState(result, lease: context.lease)
        guard let confirmed = try await savedRecurringState(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
