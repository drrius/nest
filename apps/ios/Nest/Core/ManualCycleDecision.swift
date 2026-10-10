import Foundation

struct ManualCycleDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let input: ManualCycleInput
    let approved: Bool
}

extension ManualCycleApprovalEnvelope {
    func matching(_ decision: ManualCycleDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.input == decision.input,
            !terminal || approval.status == (decision.approved ? .consumed : .denied)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func decideManualCycle(token: String, member: VerifiedMember, decision: ManualCycleDecision) async throws
        -> ManualCycleApprovalEnvelope
    {
        let result = try await http.write(
            "v1/money/recurring/manual/approval/decide", token: token, household: member.householdId,
            body: decision, as: ManualCycleApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
