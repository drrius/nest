import Foundation

extension NotificationAPI {
    func choreReminder(token: String, member: VerifiedMember, id: UUID) async throws -> ChoreReminderContext {
        let result = try await http.read(
            "v1/chore-reminders/detail?occurrenceId=\(id.uuidString.lowercased())",
            token: token, household: member.householdId, as: ChoreReminderContext.self)
        return try result.validated(member: member, id: id)
    }

    func saveChoreReminder(token: String, member: VerifiedMember, command: SaveChoreReminder) async throws
        -> ChoreReminderReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/chore-reminders/save", token: token, household: member.householdId,
            body: command, as: ChoreReminderReceipt.self)
        return try result.validated(member: member, expected: command)
    }

    func recoverChoreReminder(
        token: String, member: VerifiedMember, command: SaveChoreReminder,
        cancel: Bool
    ) async throws -> ChoreReminderRecovery {
        let result: ChoreReminderRecovery
        if cancel {
            result = try await http.write(
                "v1/chore-reminders/cancel-operation", token: token,
                household: member.householdId,
                body: ChoreReminderOperation(operationId: command.operationId),
                as: ChoreReminderRecovery.self)
        } else {
            result = try await http.read(
                "v1/chore-reminders/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: ChoreReminderRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct ChoreReminderOperation: Encodable { let operationId: UUID }
