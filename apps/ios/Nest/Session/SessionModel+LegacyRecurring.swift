import Foundation

extension SessionModel {
    func readLegacyRecurring(_ context: ExpenseContext, after: UUID?) async throws -> LegacyRecurringList {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let page = try await moneyAPI.legacyRecurring(token: token, member: context.member, after: after)
        try requireMoneyAccount(context.member, generation: context.generation)
        return page
    }

    func readLegacyDrafts(_ context: ExpenseContext, ruleId: UUID, after: UUID?) async throws -> LegacyDraftList {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let page = try await moneyAPI.legacyDrafts(
            token: token, member: context.member, ruleId: ruleId, after: after)
        try requireMoneyAccount(context.member, generation: context.generation)
        return page
    }
}
