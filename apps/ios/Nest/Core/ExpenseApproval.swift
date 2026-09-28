import Foundation

struct ExpenseApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let expense: ExpenseInput
    let status: Status
    let expiresAt: String
    let receipt: ExpenseReceipt?
}

struct ExpenseApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: ExpenseApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try approval.expense.validated(member: member)
        if let receipt = approval.receipt {
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.expense == approval.expense
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension MoneyAPI {
    func expenseApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> ExpenseApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/approval?approvalId=\(approvalId.uuidString.lowercased())", token: token,
            household: member.householdId, as: ExpenseApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
