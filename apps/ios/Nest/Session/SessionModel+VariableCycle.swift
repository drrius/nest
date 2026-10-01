import Foundation

extension SessionModel {
    func savedVariableCycle(_ context: ExpenseContext) async throws -> SavedVariableCycle? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readVariableCycle(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageVariableCycle(_ input: VariableCycleInput, context: ExpenseContext) async throws {
        let current = try await readRecurringRule(context, ruleId: input.ruleId)
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        try input.validated(member: context.member, balance: balance, detail: current)
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueVariableCycle(.init(operationId: UUID(), input: input), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryVariableCycle(_ context: ExpenseContext) async throws -> SavedVariableCycle {
        guard let saved = try await savedVariableCycle(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedVariableCycle(context, saved: saved, token: token)
        }
        let recovered = try await moneyAPI.recoverVariableCycle(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileVariableCycle(recovered, lease: context.lease)
        guard let current = try await savedVariableCycle(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedVariableCycle(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveVariableCycle(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmVariableCycle(receipt, lease: context.lease)
        guard let confirmed = try await savedVariableCycle(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelVariableCycle(_ context: ExpenseContext) async throws -> SavedVariableCycle {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestVariableCycleCancellation(lease: context.lease)
        return try await retryVariableCycle(context)
    }

    func finishVariableCycle(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishVariableCycle(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedVariableCycle(_ context: ExpenseContext, saved: SavedVariableCycle, token: String)
        async throws
        -> SavedVariableCycle
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelVariableCycle(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileVariableCycle(result, lease: context.lease)
        guard let confirmed = try await savedVariableCycle(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
