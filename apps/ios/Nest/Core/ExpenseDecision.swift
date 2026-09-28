import Foundation

struct ExpenseDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let expense: ExpenseInput
    let approved: Bool
}

extension ExpenseApprovalEnvelope {
    func matching(_ decision: ExpenseDecision, member: VerifiedMember, terminal: Bool) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.expense == decision.expense else {
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
    func decideExpense(token: String, member: VerifiedMember, decision: ExpenseDecision) async throws
        -> ExpenseApprovalEnvelope
    {
        _ = try decision.expense.validated(member: member)
        let result = try await http.write(
            "v1/money/approval/decide", token: token,
            household: member.householdId, body: decision, as: ExpenseApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
