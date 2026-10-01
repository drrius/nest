import Foundation

extension SessionModel {
    func readRecurringStateApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> RecurringStateApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringStateApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedRecurringStateDecision(_ context: ExpenseContext) async throws -> SavedRecurringStateDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurringStateDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurringStateDecision(_ decision: RecurringStateDecision, context: ExpenseContext) async throws {
        let proposal = try await readRecurringStateApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        let rule = try await readRecurringRule(context, ruleId: decision.change.ruleId).rule
        guard !decision.approved || decision.change.matches(rule) else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurringStateDecision(decision, rule: rule, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurringStateDecision(_ context: ExpenseContext) async throws -> SavedRecurringStateDecision {
        guard let saved = try await savedRecurringStateDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recurringStateApproval(
            token: token, member: context.member, approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringStateDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedRecurringStateDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        if !ApprovalTime.isOpen(recovered.approval.expiresAt, now: .now) {
            let expiry = try await moneyAPI.approvalExpiry(
                token: token, member: context.member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: saved.decision.change.command)
            try requireMoneyAccount(context.member, generation: context.generation)
            guard expiry.expiredUnused else { throw NestAPIFailure.conflict }
            try await offline.expireRecurringStateDecision(expiry, lease: context.lease)
        } else {
            if saved.decision.approved {
                let rule = try await readRecurringRule(context, ruleId: saved.decision.change.ruleId).rule
                guard saved.decision.change.matches(rule) else { throw NestAPIFailure.conflict }
            }
            let result = try await moneyAPI.decideRecurringState(
                token: token, member: context.member, decision: saved.decision)
            try requireMoneyAccount(context.member, generation: context.generation)
            try await offline.reconcileRecurringStateDecision(result, lease: context.lease)
        }
        guard let confirmed = try await savedRecurringStateDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func finishRecurringStateDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurringStateDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
