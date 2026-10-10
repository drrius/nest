import Foundation

extension SessionModel {
    func readLegacyAdoptionApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> LegacyAdoptionApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyAdoptionApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readLegacyAdoptionProposalContext(_ context: ExpenseContext, approval: LegacyAdoptionApproval)
        async throws
        -> LegacyAdoptionProposalContext
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.legacyAdoptionProposalContext(
            token: token, member: context.member, approval: approval)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedLegacyAdoptionDecision(_ context: ExpenseContext) async throws -> SavedLegacyAdoptionDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readLegacyAdoptionDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageLegacyAdoptionDecision(
        _ decision: LegacyAdoptionDecision, reviewed: LegacyAdoptionProposalContext?, context: ExpenseContext
    ) async throws {
        let proposal = try await readLegacyAdoptionApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member)
        guard !proposal.approval.isTerminal else { throw NestAPIFailure.conflict }
        var current = reviewed
        if decision.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            let today = try await readRecurringRules(context, after: nil, dueOnly: false).today
            current = try await readLegacyAdoptionProposalContext(context, approval: proposal.approval)
            guard let currentReview = current?.review else { throw NestAPIFailure.conflict }
            _ = try decision.input.validated(
                member: context.member, balance: balance, review: currentReview, today: today)
            try await requireLegacyAdoptionCategory(context, input: decision.input)
            guard current?.matches == true, current == reviewed,
                ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueLegacyAdoptionDecision(decision, context: current, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    /// A raw fingerprint can revert. Only an owner-bound server outcome is terminal.
    func checkLegacyAdoptionDecision(_ context: ExpenseContext) async throws -> SavedLegacyAdoptionDecision {
        guard let saved = try await savedLegacyAdoptionDecision(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let result = try await readLegacyAdoptionApproval(context, approvalId: saved.decision.approvalId)
        try await offline.reconcileLegacyAdoptionDecision(result, lease: context.lease)
        guard let current = try await savedLegacyAdoptionDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return current
    }

    func retryLegacyAdoptionDecision(_ context: ExpenseContext) async throws -> SavedLegacyAdoptionDecision {
        let saved = try await checkLegacyAdoptionDecision(context)
        if saved.isTerminal { return saved }
        guard let proposal = saved.result?.approval else { throw OfflineFailure.invalidOperation }
        if saved.sending.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            let today = try await readRecurringRules(context, after: nil, dueOnly: false).today
            let current = try await readLegacyAdoptionProposalContext(context, approval: proposal)
            _ = try saved.decision.input.validated(
                member: context.member, balance: balance, review: current.review, today: today)
            try await requireLegacyAdoptionCategory(context, input: saved.decision.input)
            guard current.matches, current == saved.reviewedContext,
                ApprovalTime.isOpen(proposal.expiresAt, now: .now)
            else { throw NestAPIFailure.conflict }
        }
        guard let latest = try await savedLegacyAdoptionDecision(context), let offline, let moneyAPI,
            latest.decision == saved.decision
        else { throw OfflineFailure.invalidOperation }
        if latest.isTerminal { return latest }
        let token = try await expenseToken(context)
        let result = try await moneyAPI.decideLegacyAdoption(
            token: token, member: context.member, decision: latest.sending)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileLegacyAdoptionDecision(result, lease: context.lease)
        guard let confirmed = try await savedLegacyAdoptionDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func withdrawLegacyAdoptionDecision(_ context: ExpenseContext) async throws -> SavedLegacyAdoptionDecision {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.withdrawLegacyAdoptionDecision(lease: context.lease)
        return try await retryLegacyAdoptionDecision(context)
    }

    func finishLegacyAdoptionDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishLegacyAdoptionDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func requireLegacyAdoptionCategory(_ context: ExpenseContext, input: LegacyAdoptionInput) async throws {
        guard let id = input.configuration.categoryId else { return }
        guard try await readMoneyCategory(context, categoryId: id).category != nil else {
            throw NestAPIFailure.conflict
        }
    }
}
