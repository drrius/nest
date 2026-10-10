import Foundation

extension NotificationAPI {
    func renewalReminder(token: String, member: VerifiedMember, id: UUID) async throws -> RenewalReminderEnvelope {
        let result = try await http.read(
            "v1/renewal-reminders/detail?renewalId=\(id.uuidString.lowercased())",
            token: token, household: member.householdId, as: RenewalReminderEnvelope.self)
        return try result.validated(member: member, id: id)
    }

    func saveRenewalReminder(token: String, member: VerifiedMember, command: SaveRenewalReminder) async throws
        -> RenewalReminderReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/renewal-reminders/save", token: token, household: member.householdId,
            body: command, as: RenewalReminderReceipt.self)
        return try result.validated(member: member, expected: command)
    }

    func recoverRenewalReminder(
        token: String, member: VerifiedMember, command: SaveRenewalReminder,
        cancel: Bool
    ) async throws -> RenewalReminderRecovery {
        let result: RenewalReminderRecovery
        if cancel {
            result = try await http.write(
                "v1/renewal-reminders/cancel-operation", token: token,
                household: member.householdId,
                body: ReminderOperation(operationId: command.operationId),
                as: RenewalReminderRecovery.self)
        } else {
            result = try await http.read(
                "v1/renewal-reminders/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: RenewalReminderRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct ReminderOperation: Encodable { let operationId: UUID }
