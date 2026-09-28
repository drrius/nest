import Foundation

struct SettlementDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let settlement: SettlementInput
    let approved: Bool
}

extension SettlementApprovalEnvelope {
    func matching(_ decision: SettlementDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.settlement == decision.settlement else {
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
    func decideSettlement(token: String, member: VerifiedMember, decision: SettlementDecision) async throws
        -> SettlementApprovalEnvelope
    {
        _ = try decision.settlement.validated(member: member)
        let result = try await http.write(
            "v1/money/settlement/approval/decide", token: token,
            household: member.householdId, body: decision, as: SettlementApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
