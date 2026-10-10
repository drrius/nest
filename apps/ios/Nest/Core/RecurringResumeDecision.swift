import Foundation

struct RecurringResumeDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let change: RecurringResumeInput
    let approved: Bool
}

extension RecurringResumeApprovalEnvelope {
    func matching(_ decision: RecurringResumeDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.change == decision.change,
            !terminal || approval.status == (decision.approved ? .consumed : .denied)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func decideRecurringResume(token: String, member: VerifiedMember, decision: RecurringResumeDecision) async throws
        -> RecurringResumeApprovalEnvelope
    {
        try decision.change.validated()
        let result = try await http.write(
            "v1/money/recurring/resume/approval/decide", token: token, household: member.householdId,
            body: decision, as: RecurringResumeApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
