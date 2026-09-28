import Foundation

struct SettlementApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let settlement: SettlementInput
    let status: Status
    let expiresAt: String
    let receipt: SettlementReceipt?
}

struct SettlementApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: SettlementApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try approval.settlement.validated(member: member)
        if let receipt = approval.receipt {
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.settlement == approval.settlement
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension MoneyAPI {
    func settlementApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> SettlementApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/settlement/approval?approvalId=\(approvalId.uuidString.lowercased())", token: token,
            household: member.householdId, as: SettlementApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
