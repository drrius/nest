import Foundation

struct RefundDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let refund: RefundInput
    let approved: Bool
}

extension RefundApprovalEnvelope {
    func matching(_ decision: RefundDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.refund == decision.refund else {
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
    func decideRefund(token: String, member: VerifiedMember, decision: RefundDecision) async throws
        -> RefundApprovalEnvelope
    {
        _ = try decision.refund.validated(member: member)
        let result = try await http.write(
            "v1/money/refund/approval/decide", token: token,
            household: member.householdId, body: decision, as: RefundApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
