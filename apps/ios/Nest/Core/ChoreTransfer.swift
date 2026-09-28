import Foundation

struct RequestChoreTransfer: Codable, Equatable, Sendable {
    let operationId: UUID
    let occurrenceId: UUID
    let expectedDueDate: CivilDate
    let recipientId: UUID
}

struct RespondChoreTransfer: Codable, Equatable, Sendable {
    enum Action: String, Codable, Sendable { case accept, decline }
    let operationId: UUID
    let requestId: UUID
    let action: Action
}

struct ChoreTransferReceipt: Codable, Equatable, Sendable {
    let requestId: UUID
    let occurrenceId: UUID
    let dueDate: CivilDate
    let fromMemberId: UUID
    let toMemberId: UUID
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let action: String
    let state: String

    private func identity(member: VerifiedMember, operation: UUID) throws {
        guard actorId == member.userId, householdId == member.householdId, operationId == operation,
            fromMemberId != toMemberId
        else { throw ChoreContractError.invalidReceipt }
    }

    func validated(member: VerifiedMember, command: RequestChoreTransfer) throws -> Self {
        try identity(member: member, operation: command.operationId)
        guard action == "request", state == "pending", fromMemberId == member.userId,
            toMemberId == command.recipientId, occurrenceId == command.occurrenceId,
            dueDate == command.expectedDueDate
        else { throw ChoreContractError.invalidReceipt }
        return self
    }

    func validated(member: VerifiedMember, command: RespondChoreTransfer, pending: PendingChoreTransfer) throws -> Self
    {
        try identity(member: member, operation: command.operationId)
        guard action == command.action.rawValue, state == (command.action == .accept ? "accepted" : "declined"),
            requestId == command.requestId, requestId == pending.requestId,
            toMemberId == member.userId, toMemberId == pending.toMemberId,
            fromMemberId == pending.fromMemberId, occurrenceId == pending.occurrenceId, dueDate == pending.dueDate
        else { throw ChoreContractError.invalidReceipt }
        return self
    }
}

private struct ChoreTransferEnvelope: Decodable {
    let version: Int
    let receipt: ChoreTransferReceipt
}

extension ChoreAPI {
    func requestTransfer(token: String, member: VerifiedMember, command: RequestChoreTransfer) async throws
        -> ChoreTransferReceipt
    {
        guard command.recipientId != member.userId else { throw ChoreContractError.invalidSnapshot }
        let result = try await http.write(
            "v1/chores/transfers/request", token: token, household: member.householdId,
            body: command, as: ChoreTransferEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }

    func respondTransfer(
        token: String, member: VerifiedMember, command: RespondChoreTransfer, pending: PendingChoreTransfer
    ) async throws -> ChoreTransferReceipt {
        guard pending.toMemberId == member.userId, pending.requestId == command.requestId,
            pending.fromMemberId != pending.toMemberId
        else { throw ChoreContractError.invalidSnapshot }
        let result = try await http.write(
            "v1/chores/transfers/respond", token: token, household: member.householdId,
            body: command, as: ChoreTransferEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command, pending: pending)
    }
}
