import Foundation

public struct MealProposalEditCommand: Codable, Equatable, Sendable {
    public enum Action: String, Codable, Sendable { case replace, choose }
    public let action: Action
    public let operationId: UUID
    public let proposalId: UUID
    public let expectedRevision: String
    public let entryId: UUID
    public let definitionId: UUID?
    public let expectedLibraryRevision: String?

    func validated() throws -> Self {
        guard let revision = Int64(expectedRevision), revision > 0, revision < Int64.max,
            String(revision) == expectedRevision
        else { throw MealProposalError.invalidResponse }
        switch action {
        case .replace:
            guard definitionId == nil, expectedLibraryRevision == nil else { throw MealProposalError.invalidResponse }
        case .choose:
            guard definitionId != nil, let library = expectedLibraryRevision, MealRevision.valid(library)
            else { throw MealProposalError.invalidResponse }
        }
        return self
    }

    func validated(against proposal: MealProposal, now: Date = .now) throws -> Self {
        _ = try validated()
        _ = try proposal.validated()
        guard proposal.id == proposalId, proposal.revision == expectedRevision, proposal.status == .ready,
            Double(proposal.expiresAt) > now.timeIntervalSince1970 * 1000,
            proposal.entries?.contains(where: { $0.id == entryId }) == true
        else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct MealProposalChangeReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let proposalId: UUID
    public let previousRevision: String
    public let revision: String
    public let entryId: UUID
    public let action: MealProposalEditCommand.Action
    public let definitionId: UUID?
    public let expectedLibraryRevision: String?

    func validated(member: VerifiedMember, command: MealProposalEditCommand) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, proposalId == command.proposalId, entryId == command.entryId,
            action == command.action, previousRevision == command.expectedRevision,
            let previous = Int64(previousRevision), revision == String(previous + 1),
            definitionId == command.definitionId, expectedLibraryRevision == command.expectedLibraryRevision
        else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct MealProposalEdit: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case pending, applied, failed }
    public enum Failure: String, Codable, Sendable {
        case unavailable
        case constraintsChanged = "constraints_changed"
        case noSuitableMeals = "no_suitable_meals"
    }
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let command: MealProposalEditCommand
    public let expiresAt: Int64
    public let status: Status
    public let failure: Failure?
    public let receipt: MealProposalChangeReceipt?

    func validated(member: VerifiedMember, expected: MealProposalEditCommand) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId, command == expected,
            (1...253_402_300_799_999).contains(expiresAt),
            (status == .applied) == (receipt != nil), (status == .failed) == (failure != nil)
        else { throw MealProposalError.invalidResponse }
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}
