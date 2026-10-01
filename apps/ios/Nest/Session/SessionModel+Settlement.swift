import Foundation

extension SessionModel {
    func savedSettlement(_ context: ExpenseContext) async throws -> SavedSettlement? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readSettlement(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageSettlement(_ settlement: SettlementInput, context: ExpenseContext) async throws {
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        _ = try settlement.validated(member: context.member, balance: balance)
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueSettlement(.init(operationId: UUID(), settlement: settlement), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retrySettlement(_ context: ExpenseContext) async throws -> SavedSettlement {
        guard let saved = try await savedSettlement(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested { return try await cancelSavedSettlement(context, saved: saved, token: token) }
        let recovered = try await moneyAPI.recoverSettlement(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileSettlement(recovered, lease: context.lease)
        guard let current = try await savedSettlement(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedSettlement(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveSettlement(token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmSettlement(receipt, lease: context.lease)
        guard let confirmed = try await savedSettlement(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelSettlement(_ context: ExpenseContext) async throws -> SavedSettlement {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestSettlementCancellation(lease: context.lease)
        return try await retrySettlement(context)
    }

    func finishSettlement(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishSettlement(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedSettlement(_ context: ExpenseContext, saved: SavedSettlement, token: String) async throws
        -> SavedSettlement
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelSettlement(token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileSettlement(result, lease: context.lease)
        guard let confirmed = try await savedSettlement(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
