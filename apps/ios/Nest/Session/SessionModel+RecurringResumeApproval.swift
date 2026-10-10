import Foundation

extension SessionModel {
    func readRecurringResumeApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> RecurringResumeApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringResumeApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedRecurringResumeDecision(_ context: ExpenseContext) async throws -> SavedRecurringResumeDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readRecurringResumeDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageRecurringResumeDecision(_ decision: RecurringResumeDecision, context: ExpenseContext) async throws {
        let proposal = try await readRecurringResumeApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        let detail = try await readRecurringRule(context, ruleId: decision.change.ruleId)
        let rule = detail.rule
        guard
            !decision.approved
                || (decision.change.matches(rule, today: detail.today)
                    && decision.change.resumeFrom.value >= proposal.approval.reviewedOn.value)
        else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueRecurringResumeDecision(decision, rule: rule, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryRecurringResumeDecision(_ context: ExpenseContext) async throws -> SavedRecurringResumeDecision {
        guard let saved = try await savedRecurringResumeDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.recurringResumeApproval(
            token: token, member: context.member, approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileRecurringResumeDecision(recovered, lease: context.lease)
        guard let reconciled = try await savedRecurringResumeDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        if reconciled.isTerminal { return reconciled }
        if !ApprovalTime.isOpen(recovered.approval.expiresAt, now: .now) {
            let expiry = try await moneyAPI.approvalExpiry(
                token: token, member: context.member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .resumeRule)
            try requireMoneyAccount(context.member, generation: context.generation)
            guard expiry.expiredUnused else { throw NestAPIFailure.conflict }
            try await offline.expireRecurringResumeDecision(expiry, lease: context.lease)
        } else {
            if saved.decision.approved {
                let detail = try await readRecurringRule(
                    context, ruleId: saved.decision.change.ruleId)
                guard saved.decision.change.matches(detail.rule, today: detail.today),
                    saved.decision.change.resumeFrom.value >= recovered.approval.reviewedOn.value
                else { throw NestAPIFailure.conflict }
            }
            let result = try await moneyAPI.decideRecurringResume(
                token: token, member: context.member, decision: saved.decision)
            try requireMoneyAccount(context.member, generation: context.generation)
            try await offline.reconcileRecurringResumeDecision(result, lease: context.lease)
        }
        guard let confirmed = try await savedRecurringResumeDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func finishRecurringResumeDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishRecurringResumeDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
