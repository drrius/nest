import Foundation

extension MoneyAPI {
    func saveRecurring(token: String, member: VerifiedMember, command: SaveRecurring) async throws
        -> RecurringReceipt
    {
        _ = try command.rule.validated(member: member)
        let receipt = try await http.write(
            "v1/money/recurring/save", token: token, household: member.householdId, body: command,
            as: RecurringReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverRecurring(token: String, member: VerifiedMember, command: SaveRecurring) async throws
        -> RecurringRecovery
    {
        _ = try command.rule.validated(member: member)
        let result = try await http.read(
            "v1/money/recurring/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelRecurring(token: String, member: VerifiedMember, command: SaveRecurring) async throws
        -> RecurringRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.rule.validated(member: member)
        let result = try await http.write(
            "v1/money/recurring/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: RecurringRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
