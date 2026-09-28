import Foundation

public struct MealProposalAPI: Sendable {
    private let http: NestHTTP
    public init(http: NestHTTP) { self.http = http }

    public func reserve(token: String, member: VerifiedMember, command: GenerateMealProposal) async throws
        -> MealProposalGenerationReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/meals/proposal/reserve", token: token, household: member.householdId,
            body: command, as: ProposalReserved.self)
        guard result.version == 1 else { throw MealProposalError.invalidResponse }
        return try result.receipt.validated(member: member, command: command)
    }

    public func generate(token: String, member: VerifiedMember, command: GenerateMealProposal) async throws
        -> MealProposalGenerationResult
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/meals/proposal/generate", token: token, household: member.householdId,
            body: command, as: MealProposalGenerationResult.self)
        return try result.validated(member: member, command: command)
    }

    public func open(token: String, member: VerifiedMember, id: UUID) async throws -> MealProposalGenerationResult {
        let result = try await http.write(
            "v1/meals/proposal/open", token: token, household: member.householdId,
            body: ProposalQuery(proposalId: id), as: MealProposalGenerationResult.self)
        return try result.validated(member: member, id: id)
    }

    public func recover(token: String, member: VerifiedMember, id: UUID) async throws -> MealProposalEnvelope {
        let result = try await http.write(
            "v1/meals/proposal/recover", token: token, household: member.householdId,
            body: ProposalQuery(proposalId: id), as: MealProposalEnvelope.self)
        return try result.validated(member: member, id: id)
    }

    public func discard(token: String, member: VerifiedMember, command: DiscardMealProposal)
        async throws -> MealProposalDiscardReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/meals/proposal/discard", token: token, household: member.householdId,
            body: command, as: ProposalDiscarded.self)
        guard result.version == 1 else { throw MealProposalError.invalidResponse }
        return try result.receipt.validated(member: member, command: command)
    }

    public func approve(token: String, member: VerifiedMember, proposal: MealProposal, command: ApproveMealProposal)
        async throws -> MealProposalApprovalReceipt
    {
        _ = try command.validated(against: proposal)
        let result = try await http.write(
            "v1/meals/proposal/approve", token: token, household: member.householdId,
            body: command, as: ProposalApproved.self)
        guard result.version == 1 else { throw MealProposalError.invalidResponse }
        return try result.receipt.validated(member: member, command: command, proposal: proposal)
    }
}

private struct ProposalQuery: Encodable { let proposalId: UUID }
private struct ProposalReserved: Decodable {
    let version: Int
    let receipt: MealProposalGenerationReceipt
}
private struct ProposalApproved: Decodable {
    let version: Int
    let receipt: MealProposalApprovalReceipt
}

private struct ProposalDiscarded: Decodable {
    let version: Int
    let receipt: MealProposalDiscardReceipt
}
