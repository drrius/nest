import Foundation

extension NotificationAPI {
    func mealReminder(token: String, member: VerifiedMember, id: UUID) async throws -> MealReminderContext {
        let result = try await http.read(
            "v1/meal-reminders/detail?entryId=\(id.uuidString.lowercased())",
            token: token, household: member.householdId, as: MealReminderContext.self)
        return try result.validated(member: member, id: id)
    }

    func saveMealReminder(token: String, member: VerifiedMember, command: SaveMealReminder) async throws
        -> MealReminderReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/meal-reminders/save", token: token, household: member.householdId,
            body: command, as: MealReminderReceipt.self)
        return try result.validated(member: member, expected: command)
    }

    func recoverMealReminder(
        token: String, member: VerifiedMember, command: SaveMealReminder,
        cancel: Bool
    ) async throws -> MealReminderRecovery {
        let result: MealReminderRecovery
        if cancel {
            result = try await http.write(
                "v1/meal-reminders/cancel-operation", token: token,
                household: member.householdId,
                body: MealReminderOperation(operationId: command.operationId),
                as: MealReminderRecovery.self)
        } else {
            result = try await http.read(
                "v1/meal-reminders/operation?operationId=\(command.operationId.uuidString.lowercased())",
                token: token, household: member.householdId, as: MealReminderRecovery.self)
        }
        _ = try result.validated(member: member, command: command)
        guard !cancel || result.status != .unresolved else { throw NestAPIFailure.contract }
        return result
    }
}

private struct MealReminderOperation: Encodable { let operationId: UUID }
