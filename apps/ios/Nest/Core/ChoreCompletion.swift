import Foundation

public struct CompleteChore: Codable, Sendable {
    public let offlineEpoch: UUID?
    public let operationId: UUID
    public let occurrenceId: UUID
    public let expectedDueDate: CivilDate
    public let completedOn: CivilDate

    public init(chore: NestChore, operationId: UUID, completedOn: CivilDate) {
        self.offlineEpoch = chore.offlineEpoch
        self.operationId = operationId
        self.occurrenceId = chore.occurrenceId
        self.expectedDueDate = chore.dueDate
        self.completedOn = completedOn
    }
}

public struct ChoreCompletion: Decodable, Equatable, Sendable {
    public enum Outcome: String, Decodable, Sendable {
        case completed
        case alreadyCompleted = "already_completed"
    }

    public let version: Int
    public let operationId: UUID
    public let occurrenceId: UUID
    public let completedBy: UUID
    public let completedOn: CivilDate
    public let outcome: Outcome
}

public struct ChoreCompletionEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let receipt: ChoreCompletion

    public func validated(household: UUID, command: CompleteChore) throws -> ChoreCompletion {
        guard version == 1, householdId == household, receipt.version == 1,
            receipt.operationId == command.operationId,
            receipt.occurrenceId == command.occurrenceId
        else { throw ChoreContractError.invalidReceipt }
        return receipt
    }
}
