import Foundation

struct RecurringApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let rule: RecurringInput
    let status: Status
    let expiresAt: String
    let receipt: RecurringReceipt?
}

struct RecurringApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: RecurringApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        try approval.rule.validated(member: member)
        if let receipt = approval.receipt {
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.rule == approval.rule, receipt.status == .active || receipt.status == .paused
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension MoneyAPI {
    func recurringApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> RecurringApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/approval?approvalId=\(approvalId.uuidString.lowercased())", token: token,
            household: member.householdId, as: RecurringApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
