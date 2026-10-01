import Foundation

struct RecurringStateDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let change: RecurringStateInput
    let approved: Bool
}

extension RecurringStateApprovalEnvelope {
    func matching(_ decision: RecurringStateDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.change == decision.change,
            !terminal || approval.status == (decision.approved ? .consumed : .denied)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func decideRecurringState(token: String, member: VerifiedMember, decision: RecurringStateDecision) async throws
        -> RecurringStateApprovalEnvelope
    {
        try decision.change.validated()
        let result = try await http.write(
            "v1/money/recurring/state/approval/decide", token: token, household: member.householdId,
            body: decision, as: RecurringStateApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
