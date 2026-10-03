import Foundation

extension MoneyAPI {
    func legacyAdoptionApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> LegacyAdoptionApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-adoption/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyAdoptionApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }

    func legacyAdoptionProposalContext(token: String, member: VerifiedMember, approval: LegacyAdoptionApproval)
        async throws -> LegacyAdoptionProposalContext
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-adoption/approval/context?approvalId=\(approval.id.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyAdoptionProposalContext.self)
        return try result.validated(member: member, approvalId: approval.id, input: approval.input)
    }

    func decideLegacyAdoption(token: String, member: VerifiedMember, decision: LegacyAdoptionDecision)
        async throws
        -> LegacyAdoptionApprovalEnvelope
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-adoption/approval/decide", token: token, household: member.householdId,
            body: decision, as: LegacyAdoptionApprovalEnvelope.self)
        return try result.matching(decision, member: member, terminal: true)
    }
}
