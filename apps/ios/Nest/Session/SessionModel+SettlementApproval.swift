import Foundation

extension SessionModel {
    func readSettlementApproval(_ context: ExpenseContext, approvalId: UUID) async throws -> SettlementApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.settlementApproval(token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedSettlementDecision(_ context: ExpenseContext) async throws -> SavedSettlementDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readSettlementDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageSettlementDecision(_ decision: SettlementDecision, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueSettlementDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retrySettlementDecision(_ context: ExpenseContext) async throws -> SavedSettlementDecision {
        guard let saved = try await savedSettlementDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, [.consumed, .denied].contains(result.approval.status) { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.settlementApproval(
            token: token, member: context.member,
            approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileSettlementDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedSettlementDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        let result = try await moneyAPI.decideSettlement(token: token, member: context.member, decision: saved.decision)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileSettlementDecision(result, lease: context.lease)
        guard let confirmed = try await savedSettlementDecision(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func finishSettlementDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishSettlementDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
