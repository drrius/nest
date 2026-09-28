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
        try requireMoneyAccount(context.member, generation: context.generation)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.enqueueCorrectionDecision(decision, lease: context.lease)
        try requireMoneyAccount(context.member, generation: context.generation)
    }

    func retryCorrectionDecision(_ context: ExpenseContext) async throws -> SavedCorrectionDecision {
        guard let saved = try await savedCorrectionDecision(context), let offline, let moneyAPI else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result, [.consumed, .denied].contains(result.approval.status) { return saved }
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
