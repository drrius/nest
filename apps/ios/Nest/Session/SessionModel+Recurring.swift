import Foundation

extension SessionModel {
    func readRecurringRules(_ context: ExpenseContext, after: UUID?, dueOnly: Bool) async throws -> RecurringList {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringRules(
            token: token, member: context.member, after: after, dueOnly: dueOnly)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readRecurringRule(_ context: ExpenseContext, ruleId: UUID) async throws -> RecurringDetail {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringRule(token: token, member: context.member, ruleId: ruleId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }
}
