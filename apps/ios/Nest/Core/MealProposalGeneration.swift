import Foundation

public struct GenerateMealProposal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let weekStart: MealWeekStart
    public let expectedWeekRevision: String
    public let familiarOnly: Bool

    func validated() throws -> Self {
        guard MealRevision.valid(expectedWeekRevision) else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct MealProposalGenerationReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let proposalId: UUID
    public let revision: String
    public let weekStart: MealWeekStart
    public let expectedWeekRevision: String
    public let familiarOnly: Bool

    func validated(member: VerifiedMember, command: GenerateMealProposal) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, revision == "1", weekStart == command.weekStart,
            expectedWeekRevision == command.expectedWeekRevision, familiarOnly == command.familiarOnly
        else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct MealProposalGenerationResult: Decodable, Sendable {
    public let version: Int
    public let receipt: MealProposalGenerationReceipt
    public let envelope: MealProposalEnvelope

    func validated(member: VerifiedMember, command: GenerateMealProposal? = nil, id: UUID? = nil) throws -> Self {
        let expected =
            command
            ?? GenerateMealProposal(
                operationId: receipt.operationId, weekStart: receipt.weekStart,
                expectedWeekRevision: receipt.expectedWeekRevision, familiarOnly: receipt.familiarOnly)
        _ = try receipt.validated(member: member, command: expected)
        _ = try envelope.validated(member: member, id: receipt.proposalId)
        guard version == 1, id == nil || id == receipt.proposalId,
            envelope.proposal.weekStart == receipt.weekStart,
            envelope.proposal.weekRevision == receipt.expectedWeekRevision,
            envelope.proposal.familiarOnly == receipt.familiarOnly
        else { throw MealProposalError.invalidResponse }
        return self
    }
}
