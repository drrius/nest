import Foundation

public struct ApproveMealProposal: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let proposalId: UUID
    public let expectedRevision: String

    public init(proposal: MealProposal, operation: UUID, now: Date = .now) throws {
        _ = try proposal.validated()
        guard proposal.status == .ready, Double(proposal.expiresAt) > now.timeIntervalSince1970 * 1000
        else { throw MealProposalError.invalidResponse }
        operationId = operation
        proposalId = proposal.id
        expectedRevision = proposal.revision
        _ = try validated(against: proposal)
    }

    func validated(against proposal: MealProposal) throws -> Self {
        _ = try proposal.validated()
        guard proposal.status == .ready, proposalId == proposal.id, expectedRevision == proposal.revision,
            let revision = Int64(expectedRevision), revision < Int64.max,
            let weekRevision = Int64(proposal.weekRevision), let entries = proposal.entries,
            weekRevision <= Int64.max - Int64(entries.count)
        else { throw MealProposalError.invalidResponse }
        return self
    }
}

public struct PostedProposalMeal: Codable, Equatable, Sendable {
    public let proposalEntryId: UUID
    public let entryId: UUID
    public let date: CivilDate
    public let slot: MealSlot
}

public struct MealProposalApprovalReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let proposalId: UUID
    public let approvedRevision: String
    public let revision: String
    public let weekStart: MealWeekStart
    public let previousWeekRevision: String
    public let weekRevision: String
    public let entries: [PostedProposalMeal]

    func validated(member: VerifiedMember, command: ApproveMealProposal, proposal: MealProposal) throws -> Self {
        _ = try command.validated(against: proposal)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, proposalId == command.proposalId,
            approvedRevision == command.expectedRevision, let approved = Int64(approvedRevision),
            revision == String(approved + 1), weekStart == proposal.weekStart,
            previousWeekRevision == proposal.weekRevision, let previous = Int64(previousWeekRevision),
            let proposed = proposal.entries, entries.count == proposed.count,
            weekRevision == String(previous + Int64(entries.count))
        else { throw MealProposalError.invalidResponse }
        try validatePostedEntries(proposed)
        return self
    }

    private func validatePostedEntries(_ proposed: [ProposedMeal]) throws {
        guard Set(entries.map(\.entryId)).count == entries.count,
            Set(entries.map(\.proposalEntryId)).count == entries.count
        else { throw MealProposalError.invalidResponse }
        let preview = Dictionary(uniqueKeysWithValues: proposed.map { ($0.id, $0) })
        for entry in entries {
            guard let expected = preview[entry.proposalEntryId], entry.date == expected.date,
                entry.slot == expected.slot
            else { throw MealProposalError.invalidResponse }
        }
    }
}
