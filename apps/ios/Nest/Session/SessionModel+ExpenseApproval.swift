import Foundation

extension SessionModel {
    func readPendingApprovals(_ context: ExpenseContext, after: UUID?) async throws -> PendingFinancialApprovals {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.pendingApprovals(token: token, member: context.member, after: after)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func readExpenseApproval(_ context: ExpenseContext, approvalId: UUID) async throws -> ExpenseApprovalEnvelope {
        let token = try await expenseToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.expenseApproval(token: token, member: context.member, approvalId: approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        return result
    }

    func savedExpenseDecision(_ context: ExpenseContext) async throws -> SavedExpenseDecision? {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readExpenseDecision(lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
        return saved
    }

    func stageExpenseDecision(_ decision: ExpenseDecision, context: ExpenseContext) async throws {
        let proposal = try await readExpenseApproval(context, approvalId: decision.approvalId)
            .matching(decision, member: context.member, terminal: false)
        guard proposal.approval.status == .pending,
            ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now)
        else { throw NestAPIFailure.conflict }
        if decision.approved, let categoryId = decision.expense.categoryId {
            guard try await readMoneyCategory(context, categoryId: categoryId).category != nil else {
                throw NestAPIFailure.conflict
            }
        }
        guard ApprovalTime.isOpen(proposal.approval.expiresAt, now: .now) else { throw NestAPIFailure.conflict }
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueExpenseDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryExpenseDecision(_ context: ExpenseContext) async throws -> SavedExpenseDecision {
        guard let saved = try await savedExpenseDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if saved.isTerminal { return saved }
        let token = try await expenseToken(context)
        let recovered = try await moneyAPI.expenseApproval(
            token: token, member: context.member,
            approvalId: saved.decision.approvalId)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileExpenseDecision(recovered, lease: context.lease)
        if [.consumed, .denied].contains(recovered.approval.status) {
            guard let current = try await savedExpenseDecision(context) else { throw OfflineFailure.invalidOperation }
            return current
        }
        let expiry = try await moneyAPI.approvalExpiry(
            token: token, member: context.member, approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .expense)
        try requireMoneyAccount(context.member, generation: context.generation)
        if expiry.expiredUnused {
            try await offline.expireExpenseDecision(expiry, lease: context.lease)
            guard let current = try await savedExpenseDecision(context) else { throw OfflineFailure.invalidOperation }
            return current
        }
        let result = try await moneyAPI.decideExpense(token: token, member: context.member, decision: saved.decision)
        try requireMoneyAccount(context.member, generation: context.generation)
        try await offline.reconcileExpenseDecision(result, lease: context.lease)
        guard let confirmed = try await savedExpenseDecision(context) else { throw OfflineFailure.invalidOperation }
        return confirmed
    }

    func finishExpenseDecision(_ context: ExpenseContext, approvalId: UUID) async throws {
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishExpenseDecision(approvalId: approvalId, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }
}
