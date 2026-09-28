import Foundation

extension MoneyAPI {
    func saveRecurringState(token: String, member: VerifiedMember, command: SaveRecurringState) async throws
        -> RecurringStateReceipt
    {
        _ = try command.change.validated()
        let receipt = try await http.write(
            "v1/money/recurring/state/save", token: token, household: member.householdId, body: command,
            as: RecurringStateReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverRecurringState(token: String, member: VerifiedMember, command: SaveRecurringState) async throws
        -> RecurringStateRecovery
    {
        _ = try command.change.validated()
        let result = try await http.read(
            "v1/money/recurring/state/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringStateRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelRecurringState(token: String, member: VerifiedMember, command: SaveRecurringState) async throws
        -> RecurringStateRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.change.validated()
        let result = try await http.write(
            "v1/money/recurring/state/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: RecurringStateRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
