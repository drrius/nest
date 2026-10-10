import Foundation

struct CorrectionDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let correction: CorrectionInput
    let approved: Bool
}

extension CorrectionApprovalEnvelope {
    func matching(_ decision: CorrectionDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.correction == decision.correction else {
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
    func decideCorrection(token: String, member: VerifiedMember, decision: CorrectionDecision) async throws
        -> CorrectionApprovalEnvelope
    {
        _ = try decision.correction.validated(member: member)
        let result = try await http.write(
            "v1/money/correction/approval/decide", token: token,
            household: member.householdId, body: decision, as: CorrectionApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
