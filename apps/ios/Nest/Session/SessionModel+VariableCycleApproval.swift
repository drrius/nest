import Foundation

extension SessionModel {
    func readVariableCycleApproval(_ context: ExpenseContext, approvalId: UUID) async throws
        -> VariableCycleApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.variableCycleApproval(
            token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedVariableCycleDecision(_ context: ExpenseContext) async throws -> SavedVariableCycleDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readVariableCycleDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageVariableCycleDecision(_ decision: VariableCycleDecision, context: ExpenseContext) async throws {
        let proposal = try await readVariableCycleApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        let detail = try await readRecurringRule(context, ruleId: decision.input.ruleId)
        if decision.approved {
            let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
            try decision.input.validated(member: context.member, balance: balance, detail: detail)
        }
        guard ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now) else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueVariableCycleDecision(decision, detail: detail, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryVariableCycleDecision(_ context: ExpenseContext) async throws -> SavedVariableCycleDecision {
        guard let saved = try await savedVariableCycleDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.variableCycleApproval(
            token: token, member: context.member, approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileVariableCycleDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedVariableCycleDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        if !ApprovalTime.isOpen(recovered.approval.expiresAt, now: .now) {
            let expiry = try await moneyAPI.approvalExpiry(
                token: token, member: context.member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .recordCycle)
            try requireMoneyAccount(context.member, generation: context.generation)
            guard expiry.expiredUnused else { throw NestAPIFailure.conflict }
            try await offline.expireVariableCycleDecision(expiry, lease: context.lease)
        } else {
            if saved.decision.approved {
                let detail = try await readRecurringRule(context, ruleId: saved.decision.input.ruleId)
                if saved.decision.input.permanentlyInvalidated(by: detail) {
                    return try await reconcileChangedVariableCycle(context, saved: saved, detail: detail)
                }
                let balance = try await readMoneyBalance(member: context.member, generation: context.generation)
                try saved.decision.input.validated(member: context.member, balance: balance, detail: detail)
            }
            let result = try await moneyAPI.decideVariableCycle(
                token: token, member: context.member, decision: saved.decision)
            try requireMoneyAccount(context.member, generation: context.generation)
            try await offline.reconcileVariableCycleDecision(result, lease: context.lease)
        }
        guard let confirmed = try await savedVariableCycleDecision(context) else {
            throw OfflineFailure.invalidOperation
        }
        return confirmed
    }

    func finishVariableCycleDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishVariableCycleDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    private func reconcileChangedVariableCycle(
        _ context: ExpenseContext, saved: SavedVariableCycleDecision, detail: RecurringDetail
    ) async throws -> SavedVariableCycleDecision {
        guard let offline else { throw NestAPIFailure.configuration }
        // The operation fence must be read after the irreversible rule/cycle change, not before it.
        let fenced = try await readVariableCycleApproval(context, approvalId: saved.decision.approvalId)
        try await offline.reconcileVariableCycleDecision(fenced, lease: context.lease)
        if [.pending, .approved].contains(fenced.approval.status) {
            try await offline.retireVariableCycleDecision(
                .init(detail: detail, fencedApproval: fenced), lease: context.lease)
        }
        guard let result = try await savedVariableCycleDecision(context) else { throw OfflineFailure.invalidOperation }
        return result
    }
}
