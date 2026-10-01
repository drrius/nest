import Foundation

struct VariableCycleDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let input: VariableCycleInput
    let approved: Bool
}

extension VariableCycleApprovalEnvelope {
    func matching(_ decision: VariableCycleDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.input == decision.input,
            !terminal || approval.status == (decision.approved ? .consumed : .denied)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func decideVariableCycle(token: String, member: VerifiedMember, decision: VariableCycleDecision) async throws
        -> VariableCycleApprovalEnvelope
    {
        try decision.input.validated(member: member)
        let result = try await http.write(
            "v1/money/recurring/variable/approval/decide", token: token, household: member.householdId,
            body: decision, as: VariableCycleApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
