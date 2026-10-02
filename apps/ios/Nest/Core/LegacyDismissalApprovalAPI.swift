import Foundation

extension MoneyAPI {
    func legacyDismissalApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> LegacyDismissalApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-dismissal/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyDismissalApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }

    func legacyDismissalProposalContext(token: String, member: VerifiedMember, approval: LegacyDismissalApproval)
        async throws -> LegacyDismissalProposalContext
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-dismissal/approval/context?approvalId=\(approval.id.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyDismissalProposalContext.self)
        return try result.validated(member: member, approvalId: approval.id, input: approval.input)
    }

    func decideLegacyDismissal(token: String, member: VerifiedMember, decision: LegacyDismissalDecision) async throws
        -> LegacyDismissalApprovalEnvelope
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-dismissal/approval/decide", token: token, household: member.householdId,
            body: decision, as: LegacyDismissalApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
