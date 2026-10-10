import Foundation

extension SessionModel {
    func readCorrectionApproval(_ context: ExpenseContext, approvalId: UUID) async throws -> CorrectionApprovalEnvelope
    {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.correctionApproval(token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedCorrectionDecision(_ context: ExpenseContext) async throws -> SavedCorrectionDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readCorrectionDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageCorrectionDecision(_ decision: CorrectionDecision, context: ExpenseContext) async throws {
        let proposal = try await readCorrectionApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        if decision.approved, case .expense(let expense) = decision.correction.replacement,
            let categoryId = expense.categoryId
        {
            guard try await readMoneyCategory(context, categoryId: categoryId).category != nil else {
                throw NestAPIFailure.conflict
            }
        }
        guard ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now) else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueCorrectionDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryCorrectionDecision(_ context: ExpenseContext) async throws -> SavedCorrectionDecision {
        guard let saved = try await savedCorrectionDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.correctionApproval(
            token: token, member: context.member,
            approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileCorrectionDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedCorrectionDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        let expiry = try await moneyAPI.approvalExpiry(
            token: token, member: context.member, approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .correction)
        try requireMoneyAccount(context.member, generation: context.generation)
        if expiry.expiredUnused {
            try await offline.expireCorrectionDecision(expiry, lease: context.lease)
            guard let current = try await savedCorrectionDecision(context) else {
                throw OfflineFailure.invalidOperation
            }
            return current
        }
        let result = try await moneyAPI.decideCorrection(token: token, member: context.member, decision: saved.decision)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileCorrectionDecision(result, lease: context.lease)
        guard let confirmed = try await savedCorrectionDecision(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func finishCorrectionDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishCorrectionDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
