import Foundation

extension SessionModel {
    func readLegacyDismissalApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> LegacyDismissalApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyDismissalApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readLegacyDismissalProposalContext(_ context: ExpenseContext, approval: LegacyDismissalApproval) async throws
        -> LegacyDismissalProposalContext
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyDismissalProposalContext(
            token: token, member: context.member, approval: approval)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedLegacyDismissalDecision(_ context: ExpenseContext) async throws -> SavedLegacyDismissalDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyDismissalDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageLegacyDismissalDecision(
        _ decision: LegacyDismissalDecision, reviewed: LegacyDismissalProposalContext?, context: ExpenseContext
    ) async throws {
        let proposal = try await readLegacyDismissalApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member)
        guard !proposal.approval.isTerminal else { throw NestAPIFailure.conflict }
        var current = reviewed
        if decision.approved {
            current = try await readLegacyDismissalProposalContext(context, approval: proposal.approval)
            guard current?.matches == true, current == reviewed,
                ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyDismissalDecision(decision, context: current, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    /// A raw fingerprint can revert. Only an owner-bound server outcome is terminal.
    func checkLegacyDismissalDecision(_ context: ExpenseContext) async throws -> SavedLegacyDismissalDecision {
        guard let saved = try await savedLegacyDismissalDecision(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let result = try await readLegacyDismissalApproval(context, approvalId: saved.decision.approvalId)
        try await offline.reconcileLegacyDismissalDecision(result, lease: context.lease)
        guard let current = try await savedLegacyDismissalDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return current
    }

    func retryLegacyDismissalDecision(_ context: ExpenseContext) async throws -> SavedLegacyDismissalDecision {
        let saved = try await checkLegacyDismissalDecision(context)
        if saved.isTerminal { return saved }
        guard let proposal = saved.result?.approval else { throw OfflineFailure.invalidOperation }
        if saved.sending.approved {
            let current = try await readLegacyDismissalProposalContext(context, approval: proposal)
            guard current.matches, current == saved.reviewedContext,
                ApprovalTime.isOpen(proposal.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        guard let latest = try await savedLegacyDismissalDecision(context), let offline, let moneyAPI,
            latest.decision == saved.decision
        else { throw OfflineFailure.invalidOperation }
        if latest.isTerminal { return latest }
        let token = try await expenseToken(context)
        let result = try await moneyAPI.decideLegacyDismissal(
            token: token, member: context.member, decision: latest.sending)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyDismissalDecision(result, lease: context.lease)
        guard let confirmed = try await savedLegacyDismissalDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func withdrawLegacyDismissalDecision(_ context: ExpenseContext) async throws -> SavedLegacyDismissalDecision {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.withdrawLegacyDismissalDecision(lease: context.lease)
        return try await retryLegacyDismissalDecision(context)
    }

    func finishLegacyDismissalDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyDismissalDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
