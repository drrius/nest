import Foundation

extension SessionModel {
    func readRecurringApproval(_ context: ExpenseContext, approvalId: UUID) async throws -> RecurringApprovalEnvelope {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringApproval(token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedRecurringDecision(_ context: ExpenseContext) async throws -> SavedRecurringDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurringDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurringDecision(_ decision: RecurringDecision, context: ExpenseContext) async throws {
        let proposal = try await readRecurringApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurringDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurringDecision(_ context: ExpenseContext) async throws -> SavedRecurringDecision {
        guard let saved = try await savedRecurringDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recurringApproval(
            token: token, member: context.member,
            approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedRecurringDecision(context) else { throw OfflineFailure.invalidOperation }
            return current
        }
        let expiry = try await moneyAPI.approvalExpiry(
            token: token, member: context.member, approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId,
            command: saved.decision.rule.expectedRevision == nil ? .createRule : .updateRule)
        try requireMoneyAccount(context.member, generation: context.generation)
        if expiry.expiredUnused {
            try await offline.expireRecurringDecision(expiry, lease: context.lease)
            guard let current = try await savedRecurringDecision(context) else { throw OfflineFailure.invalidOperation }
            return current
        }
        let result = try await moneyAPI.decideRecurring(token: token, member: context.member, decision: saved.decision)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringDecision(result, lease: context.lease)
        guard let confirmed = try await savedRecurringDecision(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func finishRecurringDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurringDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
