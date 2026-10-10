import Foundation

extension SessionModel {
    func savedManualCycle(_ context: ExpenseContext) async throws -> SavedManualCycle? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readManualCycle(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageManualCycle(_ input: ManualCycleInput, context: ExpenseContext) async throws {
        let current = try await readRecurringRule(context, ruleId: input.ruleId)
        let source = try await readMoneyDetail(
            member: context.member, generation: context.generation, eventId: input.sourceEventId)
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        try input.validated(member: context.member, balance: balance, target: current, source: source)
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueManualCycle(.init(operationId: UUID(), input: input), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryManualCycle(_ context: ExpenseContext) async throws -> SavedManualCycle {
        guard let saved = try await savedManualCycle(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedManualCycle(context, saved: saved, token: token)
        }
        let recovered = try await moneyAPI.recoverManualCycle(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileManualCycle(recovered, lease: context.lease)
        guard let current = try await savedManualCycle(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedManualCycle(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveManualCycle(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmManualCycle(receipt, lease: context.lease)
        guard let confirmed = try await savedManualCycle(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelManualCycle(_ context: ExpenseContext) async throws -> SavedManualCycle {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestManualCycleCancellation(lease: context.lease)
        return try await retryManualCycle(context)
    }

    func finishManualCycle(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishManualCycle(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedManualCycle(_ context: ExpenseContext, saved: SavedManualCycle, token: String)
        async throws
        -> SavedManualCycle
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelManualCycle(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileManualCycle(result, lease: context.lease)
        guard let confirmed = try await savedManualCycle(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
