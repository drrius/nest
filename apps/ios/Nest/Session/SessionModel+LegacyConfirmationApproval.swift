import Foundation

extension SessionModel {
    func readLegacyConfirmationApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> LegacyConfirmationApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyConfirmationApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readLegacyConfirmationProposalContext(_ context: ExpenseContext, approval: LegacyConfirmationApproval)
        async throws
        -> LegacyConfirmationProposalContext
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyConfirmationProposalContext(
            token: token, member: context.member, approval: approval)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedLegacyConfirmationDecision(_ context: ExpenseContext) async throws -> SavedLegacyConfirmationDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyConfirmationDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageLegacyConfirmationDecision(
        _ decision: LegacyConfirmationDecision, reviewed: LegacyConfirmationProposalContext?, context: ExpenseContext
    ) async throws {
        let proposal = try await readLegacyConfirmationApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member)
        guard !proposal.approval.isTerminal else { throw NestAPIFailure.conflict }
        var current = reviewed
        if decision.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            _ = try decision.input.expense.validated(member: context.member, balance: balance)
            current = try await readLegacyConfirmationProposalContext(context, approval: proposal.approval)
            guard current?.matches == true, current == reviewed,
                ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyConfirmationDecision(decision, context: current, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    /// A raw fingerprint can revert. Only an owner-bound server outcome is terminal.
    func checkLegacyConfirmationDecision(_ context: ExpenseContext) async throws -> SavedLegacyConfirmationDecision {
        guard let saved = try await savedLegacyConfirmationDecision(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let result = try await readLegacyConfirmationApproval(context, approvalId: saved.decision.approvalId)
        try await offline.reconcileLegacyConfirmationDecision(result, lease: context.lease)
        guard let current = try await savedLegacyConfirmationDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return current
    }

    func retryLegacyConfirmationDecision(_ context: ExpenseContext) async throws -> SavedLegacyConfirmationDecision {
        let saved = try await checkLegacyConfirmationDecision(context)
        if saved.isTerminal { return saved }
        guard let proposal = saved.result?.approval else { throw OfflineFailure.invalidOperation }
        if saved.sending.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            _ = try saved.decision.input.expense.validated(member: context.member, balance: balance)
            let current = try await readLegacyConfirmationProposalContext(context, approval: proposal)
            guard current.matches, current == saved.reviewedContext,
                ApprovalTime.isOpen(proposal.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        guard let latest = try await savedLegacyConfirmationDecision(context), let offline, let moneyAPI,
            latest.decision == saved.decision
        else { throw OfflineFailure.invalidOperation }
        if latest.isTerminal { return latest }
        let token = try await expenseToken(context)
        let result = try await moneyAPI.decideLegacyConfirmation(
            token: token, member: context.member, decision: latest.sending)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyConfirmationDecision(result, lease: context.lease)
        guard let confirmed = try await savedLegacyConfirmationDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func withdrawLegacyConfirmationDecision(_ context: ExpenseContext) async throws -> SavedLegacyConfirmationDecision {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.withdrawLegacyConfirmationDecision(lease: context.lease)
        return try await retryLegacyConfirmationDecision(context)
    }

    func finishLegacyConfirmationDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyConfirmationDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
