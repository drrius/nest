import Foundation

extension SessionModel {
    func readManualCycleApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> ManualCycleApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.manualCycleApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readManualCycleProposalContext(_ context: ExpenseContext, approval: ManualCycleApproval) async throws
        -> ManualCycleContext
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.manualCycleContext(token: token, member: context.member, approval: approval)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedManualCycleDecision(_ context: ExpenseContext) async throws -> SavedManualCycleDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readManualCycleDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageManualCycleDecision(_ decision: ManualCycleDecision, context: ExpenseContext) async throws {
        let proposal = try await readManualCycleApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        let proposalContext = try await readManualCycleProposalContext(context, approval: proposal.approval)
        if decision.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            try decision.input.validated(member: context.member, balance: balance, context: proposalContext)
        }
        guard ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now) else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueManualCycleDecision(decision, context: proposalContext, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryManualCycleDecision(_ context: ExpenseContext) async throws -> SavedManualCycleDecision {
        guard let saved = try await savedManualCycleDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.manualCycleApproval(
            token: token, member: context.member, approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileManualCycleDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedManualCycleDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        if !ApprovalTime.isOpen(recovered.approval.expiresAt, now: .now) {
            let expiry = try await moneyAPI.approvalExpiry(
                token: token, member: context.member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .linkCycle)
            try requireMoneyAccount(context.member, generation: context.generation)
            guard expiry.expiredUnused else { throw NestAPIFailure.conflict }
            try await offline.expireManualCycleDecision(expiry, lease: context.lease)
        } else {
            if saved.decision.approved {
                let proposalContext = try await readManualCycleProposalContext(context, approval: recovered.approval)
                if proposalContext.permanentlyInvalidated {
                    return try await reconcileChangedManualCycle(
                        context, saved: saved, proposalContext: proposalContext)
                }
                let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
                try saved.decision.input.validated(member: context.member, balance: balance, context: proposalContext)
            }
            let result = try await moneyAPI.decideManualCycle(
                token: token, member: context.member, decision: saved.decision)
            try requireMoneyAccount(context.member, generation: context.generation)
            try await offline.reconcileManualCycleDecision(result, lease: context.lease)
        }
        guard let confirmed = try await savedManualCycleDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func finishManualCycleDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishManualCycleDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func reconcileChangedManualCycle(
        _ context: ExpenseContext, saved: SavedManualCycleDecision, proposalContext: ManualCycleContext
    ) async throws -> SavedManualCycleDecision {
        guard let offline else { throw NestAPIFailure.configuration }
        // Read the operation fence after the irreversible rule/cycle/source change, not before it.
        let fenced = try await readManualCycleApproval(context, approvalId: saved.decision.approvalId)
        try await offline.reconcileManualCycleDecision(fenced, lease: context.lease)
        if [.pending, .approved].contains(fenced.approval.status) {
            try await offline.retireManualCycleDecision(
                .init(context: proposalContext, fencedApproval: fenced), lease: context.lease)
        }
        guard let result = try await savedManualCycleDecision(context) else { throw OfflineFailure.invalidOperation }
        return result
    }
}
