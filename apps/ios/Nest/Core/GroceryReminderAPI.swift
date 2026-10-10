import Foundation

extension NotificationAPI {
    func groceryReminder(token: String, member: VerifiedMember, id: UUID) async throws -> GroceryReminderContext {
        let result = try await http.read(
            "v1/grocery-reminders/detail?itemId=\(id.uuidString.lowercased())",
            token: token, household: member.householdId, as: GroceryReminderContext.self)
        return try result.validated(member: member, id: id)
    }

    func saveGroceryReminder(token: String, member: VerifiedMember, command: SaveGroceryReminder) async throws
        -> GroceryReminderReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/grocery-reminders/save", token: token, household: member.householdId,
            body: command, as: GroceryReminderReceipt.self)
        return try result.validated(member: member, expected: command)
    }

    func recoverGroceryReminder(
        token: String, member: VerifiedMember, command: SaveGroceryReminder,
        cancel: Bool
    ) async throws -> GroceryReminderRecovery {
        let result: GroceryReminderRecovery
        if cancel {
            result = try await http.write(
                "v1/grocery-reminders/cancel-operation", token: token,
                household: member.householdId,
                body: GroceryReminderOperation(operationId: command.operationId),
                as: GroceryReminderRecovery.self)
        } else {
            result = try await http.read(
                "v1/grocery-reminders/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: GroceryReminderRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct GroceryReminderOperation: Encodable { let operationId: UUID }
