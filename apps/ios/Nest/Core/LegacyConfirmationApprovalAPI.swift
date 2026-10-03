import Foundation

extension MoneyAPI {
    func legacyConfirmationApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> LegacyConfirmationApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-confirmation/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyConfirmationApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }

    func legacyConfirmationProposalContext(token: String, member: VerifiedMember, approval: LegacyConfirmationApproval)
        async throws -> LegacyConfirmationProposalContext
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-confirmation/approval/context?approvalId=\(approval.id.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyConfirmationProposalContext.self)
        return try result.validated(member: member, approvalId: approval.id, input: approval.input)
    }

    func decideLegacyConfirmation(token: String, member: VerifiedMember, decision: LegacyConfirmationDecision)
        async throws
        -> LegacyConfirmationApprovalEnvelope
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-confirmation/approval/decide", token: token, household: member.householdId,
            body: decision, as: LegacyConfirmationApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
