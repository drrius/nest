import Foundation

struct RecurringStateApproval: Codable, Sendable {
    let id: UUID
    let operationId: UUID
    let change: RecurringStateInput
    let status: RecurringApproval.Status
    let expiresAt: String
    let receipt: RecurringStateReceipt?
}

struct RecurringStateApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: RecurringStateApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        try approval.change.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        if let receipt = approval.receipt {
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.change == approval.change, receipt.revision != approval.change.expectedRevision,
                receipt.status == (approval.change.action == .pause ? .paused : .cancelled)
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension RecurringStateInput {
    var command: PendingFinancialApproval.Command { action == .pause ? .pauseRule : .cancelRule }

    func matches(_ rule: RecurringRule) -> Bool {
        rule.id == ruleId && rule.revision == expectedRevision && rule.status == expectedStatus
    }
}

extension MoneyAPI {
    func recurringStateApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> RecurringStateApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/state/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringStateApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
