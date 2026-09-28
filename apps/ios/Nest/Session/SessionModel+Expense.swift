import Foundation

struct ExpenseContext {
    let member: VerifiedMember
    let generation: Int
    let lease: OfflineLease
}

extension SessionModel {
    func expenseContext() throws -> ExpenseContext {
        guard case .ready(let member) = status, let lease else { throw NestAPIFailure.signedOut }
        return .init(member: member, generation: generation, lease: lease)
    }

    func savedExpense(_ context: ExpenseContext) async throws -> SavedExpense? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readExpense(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageExpense(_ expense: ExpenseInput, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueExpense(.init(operationId: UUID(), expense: expense), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryExpense(_ context: ExpenseContext) async throws -> SavedExpense {
        guard let saved = try await savedExpense(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested { return try await cancelSavedExpense(context, saved: saved, token: token) }
        let recovered = try await moneyAPI.recoverExpense(token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileExpense(recovered, lease: context.lease)
        guard let current = try await savedExpense(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested { return try await cancelSavedExpense(context, saved: current, token: token) }
        let receipt = try await moneyAPI.saveExpense(token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmExpense(receipt, lease: context.lease)
        guard let confirmed = try await savedExpense(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelExpense(_ context: ExpenseContext) async throws -> SavedExpense {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestExpenseCancellation(lease: context.lease)
        return try await retryExpense(context)
    }

    func finishExpense(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishExpense(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedExpense(_ context: ExpenseContext, saved: SavedExpense, token: String) async throws
        -> SavedExpense
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelExpense(token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileExpense(result, lease: context.lease)
        guard let confirmed = try await savedExpense(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func expenseToken(_ context: ExpenseContext) async throws -> String {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let auth else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        try requireMoneyAccount(context.member, generation: context.generation)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }
}
