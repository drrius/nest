import Foundation

public struct NestMember: Codable, Equatable, Sendable {
    public let actorId: UUID
    public let displayName: String
}

public struct NestChore: Codable, Equatable, Identifiable, Sendable {
    public let occurrenceId: UUID
    public let title: String
    public let dueDate: CivilDate
    public let assigneeId: UUID?
    public let offlineEpoch: UUID?

    public var id: UUID { occurrenceId }
}

public struct PendingChoreTransfer: Codable, Equatable, Sendable {
    public let requestId: UUID
    public let occurrenceId: UUID
    public let dueDate: CivilDate
    public let fromMemberId: UUID
    public let toMemberId: UUID
    public let title: String
}

public struct ChoreSnapshot: Codable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let members: [NestMember]
    public let transfers: [PendingChoreTransfer]
    public let chores: [NestChore]

    public func validated(household: UUID, actor: UUID) throws -> Self {
        guard version == 1, householdId == household,
            members.count <= 2, members.contains(where: { $0.actorId == actor }),
            Set(members.map(\.actorId)).count == members.count,
            chores.count <= 200, transfers.count <= 200,
            Set(chores.map(\.occurrenceId)).count == chores.count,
            Set(transfers.map(\.requestId)).count == transfers.count,
            Set(transfers.map(\.occurrenceId)).count == transfers.count,
            chores.allSatisfy({ !$0.title.isEmpty }),
            transfers.allSatisfy({ !$0.title.isEmpty && $0.fromMemberId != $0.toMemberId })
        else { throw ChoreContractError.invalidSnapshot }
        let memberIDs = Set(members.map(\.actorId))
        let choreByID = Dictionary(uniqueKeysWithValues: chores.map { ($0.occurrenceId, $0) })
        guard
            transfers.allSatisfy({ row in
                guard let chore = choreByID[row.occurrenceId] else { return false }
                return memberIDs.contains(row.fromMemberId) && memberIDs.contains(row.toMemberId)
                    && chore.assigneeId == row.fromMemberId
                    && chore.dueDate == row.dueDate && chore.title == row.title
            })
        else { throw ChoreContractError.invalidSnapshot }
        return self
    }
}

public enum ChoreContractError: Error { case invalidSnapshot, invalidReceipt }
