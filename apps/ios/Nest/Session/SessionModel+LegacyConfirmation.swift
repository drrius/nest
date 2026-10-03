import Foundation

extension SessionModel {
    func savedLegacyConfirmation(_ context: ExpenseContext) async throws -> SavedLegacyConfirmation? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyConfirmation(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageLegacyConfirmation(_ reviewed: LegacyDraftContext, expense: ExpenseInput, context: ExpenseContext)
        async throws
    {
        _ = try reviewed.validated(member: context.member, draftId: reviewed.draft.id)
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        _ = try expense.validated(member: context.member, balance: balance)
        let input = try LegacyConfirmInput(
            draftId: reviewed.draft.id, ruleId: reviewed.draft.ruleId, reviewToken: reviewed.reviewToken,
            expense: expense
        ).validated(member: context.member)
        let current = try await readLegacyDraftContext(context, draftId: reviewed.draft.id)
        guard current.canDismiss, current == reviewed else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyConfirmation(
            .init(operationId: UUID(), input: input), reviewed: reviewed, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    /// Loading and foregrounding only check the receipt; they never resend.
    func checkLegacyConfirmation(_ context: ExpenseContext) async throws -> SavedLegacyConfirmation {
        guard let saved = try await savedLegacyConfirmation(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recoverLegacyConfirmation(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyConfirmation(recovered, lease: context.lease)
        guard let current = try await savedLegacyConfirmation(context) else { throw OfflineFailure.invalidOperation }
        return current
    }

    func retryLegacyConfirmation(_ context: ExpenseContext) async throws -> SavedLegacyConfirmation {
        let saved = try await checkLegacyConfirmation(context)
        if saved.result?.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedLegacyConfirmation(context, saved: saved, token: token)
        }
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        _ = try saved.command.input.expense.validated(member: context.member, balance: balance)
        let reviewed = try await readLegacyDraftContext(context, draftId: saved.command.input.draftId)
        guard reviewed.canDismiss, reviewed == saved.reviewed else { throw NestAPIFailure.conflict }
        guard let current = try await savedLegacyConfirmation(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        guard current.command == saved.command, current.reviewed == saved.reviewed else {
            throw OfflineFailure.invalidOperation
        }
        if let result = current.result, result.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedLegacyConfirmation(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveLegacyConfirmation(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyConfirmation(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: context.lease)
        guard let confirmed = try await savedLegacyConfirmation(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelLegacyConfirmation(_ context: ExpenseContext) async throws -> SavedLegacyConfirmation {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestLegacyConfirmationCancellation(lease: context.lease)
        return try await retryLegacyConfirmation(context)
    }

    func finishLegacyConfirmation(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyConfirmation(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedLegacyConfirmation(_ context: ExpenseContext, saved: SavedLegacyConfirmation, token: String)
        async throws
        -> SavedLegacyConfirmation
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelLegacyConfirmation(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyConfirmation(result, lease: context.lease)
        guard let confirmed = try await savedLegacyConfirmation(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
