import Foundation

extension MoneyAPI {
    func saveRecurringResume(token: String, member: VerifiedMember, command: SaveRecurringResume) async throws
        -> RecurringResumeReceipt
    {
        _ = try command.change.validated()
        let receipt = try await http.write(
            "v1/money/recurring/resume/save", token: token, household: member.householdId, body: command,
            as: RecurringResumeReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverRecurringResume(token: String, member: VerifiedMember, command: SaveRecurringResume) async throws
        -> RecurringResumeRecovery
    {
        _ = try command.change.validated()
        let result = try await http.read(
            "v1/money/recurring/resume/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringResumeRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelRecurringResume(token: String, member: VerifiedMember, command: SaveRecurringResume) async throws
        -> RecurringResumeRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.change.validated()
        let result = try await http.write(
            "v1/money/recurring/resume/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: RecurringResumeRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
