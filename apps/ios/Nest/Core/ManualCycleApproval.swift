import Foundation

struct ManualCycleApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let input: ManualCycleInput
    let status: Status
    let expiresAt: String
    let receipt: ManualCycleReceipt?
}

struct ManualCycleApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: ManualCycleApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        if let receipt = approval.receipt {
            _ = try receipt.validated(
                member: member, command: .init(operationId: approval.operationId, input: approval.input),
                approvalId: approval.id)
        }
        return self
    }
}

extension MoneyAPI {
    func manualCycleApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> ManualCycleApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/manual/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: ManualCycleApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
