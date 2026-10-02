import Foundation

struct LegacyDismissalApproval: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let input: LegacyDismissInput
    let status: Status
    let expiresAt: String
    let receipt: LegacyDismissalReceipt?

    enum CodingKeys: String, CodingKey { case id, operationId, input, status, expiresAt, receipt }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(input, forKey: .input)
        try values.encode(status, forKey: .status)
        try values.encode(expiresAt, forKey: .expiresAt)
        try values.encode(receipt, forKey: .receipt)
    }

    var isTerminal: Bool { status == .denied || status == .consumed }
}

struct LegacyDismissalApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: LegacyDismissalApproval

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

    func matching(_ decision: LegacyDismissalDecision, member: VerifiedMember, terminal: Bool = false) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.input == decision.input,
            !terminal || approval.isTerminal
        else { throw NestAPIFailure.contract }
        // Withdrawal cannot undo an earlier recorded dismissal; its exact receipt wins.
        return self
    }
}

struct LegacyDismissalProposalContext: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approvalId: UUID
    let input: LegacyDismissInput
    let review: LegacyDraftContext

    func validated(member: VerifiedMember, approvalId: UUID, input: LegacyDismissInput) throws -> Self {
        _ = try review.validated(member: member, draftId: input.draftId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            self.approvalId == approvalId, self.input == input
        else { throw NestAPIFailure.contract }
        return self
    }

    var matches: Bool { review.canDismiss && review.dismissalInput == input }
}

struct LegacyDismissalDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let input: LegacyDismissInput
    let approved: Bool
}
