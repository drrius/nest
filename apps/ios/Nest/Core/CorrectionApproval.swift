import Foundation

struct CorrectionApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let correction: CorrectionInput
    let status: Status
    let expiresAt: String
    let receipt: CorrectionReceipt?
}

struct CorrectionApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: CorrectionApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try approval.correction.validated(member: member)
        if let receipt = approval.receipt {
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.correction == approval.correction,
                receipt.reversalEventId != approval.correction.sourceEventId,
                receipt.replacementEventId != approval.correction.sourceEventId,
                receipt.replacementEventId != receipt.reversalEventId,
                (receipt.replacementEventId == nil) == (approval.correction.replacement == nil),
                approval.correction.expectedReversalId == nil
                    || approval.correction.expectedReversalId == receipt.reversalEventId
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension MoneyAPI {
    func correctionApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> CorrectionApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/correction/approval?approvalId=\(approvalId.uuidString.lowercased())", token: token,
            household: member.householdId, as: CorrectionApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
