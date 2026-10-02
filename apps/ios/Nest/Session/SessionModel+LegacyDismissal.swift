import Foundation

extension SessionModel {
    func savedLegacyDismissal(_ context: ExpenseContext) async throws -> SavedLegacyDismissal? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyDismissal(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func readLegacyDraftContext(_ context: ExpenseContext, draftId: UUID) async throws -> LegacyDraftContext {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyDraftContext(token: token, member: context.member, draftId: draftId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func stageLegacyDismissal(_ reviewed: LegacyDraftContext, context: ExpenseContext) async throws {
        _ = try reviewed.validated(member: context.member, draftId: reviewed.draft.id)
        let current = try await readLegacyDraftContext(context, draftId: reviewed.draft.id)
        guard current.canDismiss, current == reviewed else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyDismissal(
            .init(operationId: UUID(), input: reviewed.dismissalInput), reviewed: reviewed, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    /// Loading and foregrounding only check the receipt; they never resend.
    func checkLegacyDismissal(_ context: ExpenseContext) async throws -> SavedLegacyDismissal {
        guard let saved = try await savedLegacyDismissal(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recoverLegacyDismissal(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyDismissal(recovered, lease: context.lease)
        guard let current = try await savedLegacyDismissal(context) else { throw OfflineFailure.invalidOperation }
        return current
    }

    func retryLegacyDismissal(_ context: ExpenseContext) async throws -> SavedLegacyDismissal {
        let saved = try await checkLegacyDismissal(context)
        if saved.result?.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedLegacyDismissal(context, saved: saved, token: token)
        }
        let reviewed = try await readLegacyDraftContext(context, draftId: saved.command.input.draftId)
        guard reviewed.canDismiss, reviewed == saved.reviewed else { throw NestAPIFailure.conflict }
        guard let current = try await savedLegacyDismissal(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        guard current.command == saved.command, current.reviewed == saved.reviewed else {
            throw OfflineFailure.invalidOperation
        }
        if let result = current.result, result.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedLegacyDismissal(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveLegacyDismissal(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyDismissal(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: context.lease)
        guard let confirmed = try await savedLegacyDismissal(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelLegacyDismissal(_ context: ExpenseContext) async throws -> SavedLegacyDismissal {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestLegacyDismissalCancellation(lease: context.lease)
        return try await retryLegacyDismissal(context)
    }

    func finishLegacyDismissal(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyDismissal(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedLegacyDismissal(_ context: ExpenseContext, saved: SavedLegacyDismissal, token: String)
        async throws
        -> SavedLegacyDismissal
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelLegacyDismissal(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyDismissal(result, lease: context.lease)
        guard let confirmed = try await savedLegacyDismissal(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
