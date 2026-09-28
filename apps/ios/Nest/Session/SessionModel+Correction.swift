import Foundation

extension SessionModel {
    func readCorrectionContext(_ context: ExpenseContext, sourceEventId: UUID) async throws -> CorrectionContext {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.correctionContext(
            token: token, member: context.member, sourceEventId: sourceEventId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedCorrection(_ context: ExpenseContext) async throws -> SavedCorrection? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readCorrection(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageCorrection(_ correction: CorrectionInput, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueCorrection(.init(operationId: UUID(), correction: correction), lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryCorrection(_ context: ExpenseContext) async throws -> SavedCorrection {
        guard let saved = try await savedCorrection(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested { return try await cancelSavedCorrection(context, saved: saved, token: token) }
        let recovered = try await moneyAPI.recoverCorrection(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileCorrection(recovered, lease: context.lease)
        guard let current = try await savedCorrection(context) else { throw OfflineFailure.invalidOperation }
        if recovered.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedCorrection(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveCorrection(token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.confirmCorrection(receipt, lease: context.lease)
        guard let confirmed = try await savedCorrection(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelCorrection(_ context: ExpenseContext) async throws -> SavedCorrection {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestCorrectionCancellation(lease: context.lease)
        return try await retryCorrection(context)
    }

    func finishCorrection(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishCorrection(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedCorrection(_ context: ExpenseContext, saved: SavedCorrection, token: String) async throws
        -> SavedCorrection
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelCorrection(token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileCorrection(result, lease: context.lease)
        guard let confirmed = try await savedCorrection(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
