import Foundation

public struct DiscardMealProposal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let proposalId: UUID
    public let expectedRevision: String

    public init(proposal: MealProposal, operation: UUID) throws {
        _ = try proposal.validated()
        guard proposal.status != .approved, proposal.status != .discarded else {
            throw MealProposalError.invalidResponse
        }
        operationId = operation
        proposalId = proposal.id
        expectedRevision = proposal.revision
        _ = try validated()
    }

    func validated() throws -> Self {
        guard let revision = Int64(expectedRevision), revision > 0, revision < Int64.max,
            String(revision) == expectedRevision
        else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct MealProposalDiscardReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let proposalId: UUID
    public let previousRevision: String
    public let revision: String

    func validated(member: VerifiedMember, command: DiscardMealProposal) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, proposalId == command.proposalId,
            previousRevision == command.expectedRevision, let previous = Int64(previousRevision),
            revision == String(previous + 1)
        else { throw MealProposalError.invalidResponse }
        return self
    }
}
