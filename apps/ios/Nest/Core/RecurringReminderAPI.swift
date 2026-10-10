import Foundation

extension NotificationAPI {
    func recurringReminder(token: String, member: VerifiedMember, id: UUID) async throws -> RecurringReminderContext {
        let result = try await http.read(
            "v1/recurring-reminders/detail?ruleId=\(id.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringReminderContext.self)
        return try result.validated(member: member, id: id)
    }

    func saveRecurringReminder(token: String, member: VerifiedMember, command: SaveRecurringReminder) async throws
        -> RecurringReminderReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/recurring-reminders/save", token: token, household: member.householdId,
            body: command, as: RecurringReminderReceipt.self)
        return try result.validated(member: member, expected: command)
    }

    func recoverRecurringReminder(
        token: String, member: VerifiedMember, command: SaveRecurringReminder,
        cancel: Bool
    ) async throws -> RecurringReminderRecovery {
        let result: RecurringReminderRecovery
        if cancel {
            result = try await http.write(
                "v1/recurring-reminders/cancel-operation", token: token,
                household: member.householdId,
                body: RecurringReminderOperation(operationId: command.operationId),
                as: RecurringReminderRecovery.self)
        } else {
            result = try await http.read(
                "v1/recurring-reminders/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: RecurringReminderRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct RecurringReminderOperation: Encodable { let operationId: UUID }
