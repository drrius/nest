import Foundation

extension SessionModel {
    func readRefundApproval(_ context: ExpenseContext, approvalId: UUID) async throws -> RefundApprovalEnvelope {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.refundApproval(token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedRefundDecision(_ context: ExpenseContext) async throws -> SavedRefundDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRefundDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRefundDecision(_ decision: RefundDecision, context: ExpenseContext) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRefundDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRefundDecision(_ context: ExpenseContext) async throws -> SavedRefundDecision {
        guard let saved = try await savedRefundDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, [.consumed, .denied].contains(result.approval.status) { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.refundApproval(
            token: token, member: context.member,
            approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRefundDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedRefundDecision(context) else { throw OfflineFailure.invalidOperation }
            return current
        }
        let result = try await moneyAPI.decideRefund(token: token, member: context.member, decision: saved.decision)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRefundDecision(result, lease: context.lease)
        guard let confirmed = try await savedRefundDecision(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func finishRefundDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRefundDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
