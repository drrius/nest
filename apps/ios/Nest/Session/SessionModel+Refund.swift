import Foundation

extension SessionModel {
    func readRefundContext(_ context: ExpenseContext, sourceEventId: UUID) async throws -> RefundContext {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.refundContext(
            token: token, member: context.member, sourceEventId: sourceEventId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedRefund(_ context: ExpenseContext) async throws -> SavedRefund? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRefund(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRefund(_ refund: RefundInput, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRefund(.init(operationId: UUID(), refund: refund), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRefund(_ context: ExpenseContext) async throws -> SavedRefund {
        guard let saved = try await savedRefund(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested { return try await cancelSavedRefund(context, saved: saved, token: token) }
        let recovered = try await moneyAPI.recoverRefund(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRefund(recovered, lease: context.lease)
        guard let current = try await savedRefund(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedRefund(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveRefund(token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmRefund(receipt, lease: context.lease)
        guard let confirmed = try await savedRefund(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelRefund(_ context: ExpenseContext) async throws -> SavedRefund {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestRefundCancellation(lease: context.lease)
        return try await retryRefund(context)
    }

    func finishRefund(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRefund(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedRefund(_ context: ExpenseContext, saved: SavedRefund, token: String) async throws
        -> SavedRefund
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelRefund(token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRefund(result, lease: context.lease)
        guard let confirmed = try await savedRefund(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
