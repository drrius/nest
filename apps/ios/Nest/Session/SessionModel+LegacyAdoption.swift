import Foundation

extension SessionModel {
    func savedLegacyAdoption(_ context: ExpenseContext) async throws -> SavedLegacyAdoption? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyAdoption(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func readLegacyAdoptionContext(_ context: ExpenseContext, ruleId: UUID) async throws -> LegacyAdoptionContext {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyAdoptionContext(token: token, member: context.member, ruleId: ruleId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func stageLegacyAdoption(_ reviewed: LegacyAdoptionContext, input: LegacyAdoptionInput, context: ExpenseContext)
        async throws
    {
        try await preflightLegacyAdoption(reviewed, input: input, context: context)
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyAdoption(
            .init(operationId: UUID(), input: input), reviewed: reviewed, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func preflightLegacyAdoption(
        _ reviewed: LegacyAdoptionContext, input: LegacyAdoptionInput,
        context: ExpenseContext
    ) async throws {
        let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
        let today = try await readRecurringRules(context, after: nil, dueOnly: false).today
        let current = try await readLegacyAdoptionContext(context, ruleId: input.ruleId)
        guard current == reviewed else { throw NestAPIFailure.conflict }
        _ = try input.validated(member: context.member, balance: balance, review: current, today: today)
    }

    /// Loading and foregrounding only check the receipt; they never resend.
    func checkLegacyAdoption(_ context: ExpenseContext) async throws -> SavedLegacyAdoption {
        guard let saved = try await savedLegacyAdoption(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, result.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recoverLegacyAdoption(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyAdoption(recovered, lease: context.lease)
        guard let current = try await savedLegacyAdoption(context) else { throw OfflineFailure.invalidOperation }
        return current
    }

    func retryLegacyAdoption(_ context: ExpenseContext) async throws -> SavedLegacyAdoption {
        let saved = try await checkLegacyAdoption(context)
        if saved.result?.status != .unresolved { return saved }
        let token = try await expenseToken(context)
        if saved.cancellationRequested {
            return try await cancelSavedLegacyAdoption(context, saved: saved, token: token)
        }
        try await preflightLegacyAdoption(saved.reviewed, input: saved.command.input, context: context)
        guard let current = try await savedLegacyAdoption(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        guard current.command == saved.command, current.reviewed == saved.reviewed else {
            throw OfflineFailure.invalidOperation
        }
        if let result = current.result, result.status != .unresolved { return current }
        if current.cancellationRequested {
            return try await cancelSavedLegacyAdoption(context, saved: current, token: token)
        }
        let receipt = try await moneyAPI.saveLegacyAdoption(
            token: token, member: context.member, command: current.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyAdoption(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: context.lease)
        guard let confirmed = try await savedLegacyAdoption(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func cancelLegacyAdoption(_ context: ExpenseContext) async throws -> SavedLegacyAdoption {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.requestLegacyAdoptionCancellation(lease: context.lease)
        return try await retryLegacyAdoption(context)
    }

    func finishLegacyAdoption(_ context: ExpenseContext, operation: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyAdoption(operation: operation, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func cancelSavedLegacyAdoption(_ context: ExpenseContext, saved: SavedLegacyAdoption, token: String)
        async throws
        -> SavedLegacyAdoption
    {
        guard let offline, let moneyAPI else { throw NestAPIFailure.configuration }
        try requireMoneyAccount(context.member, generation: context.generation)
        let result = try await moneyAPI.cancelLegacyAdoption(
            token: token, member: context.member, command: saved.command)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyAdoption(result, lease: context.lease)
        guard let confirmed = try await savedLegacyAdoption(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

}
