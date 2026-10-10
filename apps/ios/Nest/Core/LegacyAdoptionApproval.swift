import Foundation

struct LegacyAdoptionApproval: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let input: LegacyAdoptionInput
    let status: Status
    let expiresAt: String
    let receipt: LegacyAdoptionReceipt?

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

struct LegacyAdoptionApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: LegacyAdoptionApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try approval.input.validated(member: member)
        if let receipt = approval.receipt {
            _ = try receipt.validated(
                member: member, command: .init(operationId: approval.operationId, input: approval.input),
                approvalId: approval.id)
        }
        return self
    }

    func matching(_ decision: LegacyAdoptionDecision, member: VerifiedMember, terminal: Bool = false) throws -> Self {
        _ = try validated(member: member, approvalId: decision.approvalId)
        guard approval.operationId == decision.operationId, approval.input == decision.input,
            !terminal || approval.isTerminal
        else { throw NestAPIFailure.contract }
        // Withdrawal cannot undo an earlier recorded adoption; its exact receipt wins.
        return self
    }
}

struct LegacyAdoptionProposalContext: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approvalId: UUID
    let input: LegacyAdoptionInput
    let review: LegacyAdoptionContext

    func validated(member: VerifiedMember, approvalId: UUID, input: LegacyAdoptionInput) throws -> Self {
        _ = try input.validated(member: member)
        _ = try review.validated(member: member, ruleId: input.ruleId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            self.approvalId == approvalId, self.input == input
        else { throw NestAPIFailure.contract }
        return self
    }

    var matches: Bool {
        let member = VerifiedMember(userId: actorId, householdId: householdId, displayName: "")
        return (try? input.validated(member: member, review: review)) != nil
    }
}

struct LegacyAdoptionDecision: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let input: LegacyAdoptionInput
    let approved: Bool
}
