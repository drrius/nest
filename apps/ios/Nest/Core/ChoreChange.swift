import Foundation

public struct ChoreChangeCommand: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let occurrenceId: UUID
    public let expectedDueDate: CivilDate
    public let newDueDate: CivilDate?
    public var action: String { newDueDate == nil ? "skip" : "reschedule" }

    public func validated() throws -> Self {
        guard newDueDate != expectedDueDate else { throw ChoreContractError.invalidSnapshot }
        return self
    }
}

public struct ChoreChangeReceipt: Codable, Equatable, Sendable {
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let occurrenceId: UUID
    public let previousDueDate: CivilDate
    public let dueDate: CivilDate
    public let action: String
    public let status: String

    public func validated(member: VerifiedMember, command: ChoreChangeCommand) throws -> Self {
        _ = try command.validated()
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, occurrenceId == command.occurrenceId,
            previousDueDate == command.expectedDueDate,
            dueDate == (command.newDueDate ?? command.expectedDueDate), action == command.action,
            status == (command.newDueDate == nil ? "skipped" : "open")
        else { throw ChoreContractError.invalidReceipt }
        return self
    }
}

private struct ChoreChangeEnvelope: Decodable {
    let version: Int
    let receipt: ChoreChangeReceipt
}

extension ChoreAPI {
    public func changeOccurrence(token: String, member: VerifiedMember, command: ChoreChangeCommand) async throws
        -> ChoreChangeReceipt
    {
        let result = try await http.write(
            "v1/chores/" + command.action, token: token, household: member.householdId,
            body: command.validated(), as: ChoreChangeEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }
}
