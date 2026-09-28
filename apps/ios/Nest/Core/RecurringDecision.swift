import Foundation

struct RecurringDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let rule: RecurringInput
    let approved: Bool
}

extension RecurringApprovalEnvelope {
    func matching(_ decision: RecurringDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.rule == decision.rule else {
            throw NestAPIFailure.contract
        }
        if terminal {
            guard approval.status == (decision.approved ? .consumed : .denied) else {
                throw NestAPIFailure.contract
            }
        }
        return self
    }
}

extension MoneyAPI {
    func decideRecurring(token: String, member: VerifiedMember, decision: RecurringDecision) async throws
        -> RecurringApprovalEnvelope
    {
        try decision.rule.validated(member: member)
        let result = try await http.write(
            "v1/money/recurring/approval/decide", token: token,
            household: member.householdId, body: decision, as: RecurringApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
