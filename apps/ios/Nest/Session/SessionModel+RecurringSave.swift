import Foundation

extension SessionModel {
    func savedRecurring(_ context: ExpenseContext) async throws -> SavedRecurring? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurring(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurring(_ rule: RecurringInput, context: ExpenseContext) async throws {
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        let current: RecurringDetail?
        let today: CivilDate
        if rule.expectedRevision != nil {
            let detail = try await readRecurringRule(context, ruleId: rule.ruleId)
            current = detail
            today = detail.today
        } else {
            current = nil
            today = try await readRecurringRules(context, after: nil, dueOnly: false).today
        }
        try rule.validated(member: context.member, balance: balance, today: today, current: current?.rule)
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurring(.init(operationId: UUID(), rule: rule), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurring(_ context: ExpenseContext) async throws -> SavedRecurring {
        guard let saved = try await savedRecurring(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedRecurring(context, saved: saved, token: token)
        }
        let recovered = try await moneyAPI.recoverRecurring(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurring(recovered, lease: context.lease)
        guard let current = try await savedRecurring(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedRecurring(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveRecurring(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmRecurring(receipt, lease: context.lease)
        guard let confirmed = try await savedRecurring(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelRecurring(_ context: ExpenseContext) async throws -> SavedRecurring {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRecurringCancellation(lease: context.lease)
        return try await retryRecurring(context)
    }

    func finishRecurring(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurring(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedRecurring(_ context: ExpenseContext, saved: SavedRecurring, token: String)
        async throws
        -> SavedRecurring
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelRecurring(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurring(result, lease: context.lease)
        guard let confirmed = try await savedRecurring(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
