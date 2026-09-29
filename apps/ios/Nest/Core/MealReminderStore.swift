import Foundation

struct SavedMealReminderRequest: Codable, Equatable, Sendable {
    let baseline: MealReminderContext
    let command: SaveMealReminder
    var result: MealReminderRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try baseline.validated(member: member, id: command.entryId)
        _ = try command.validated()
        guard command.expectedItemRevision == baseline.itemRevision,
            command.expectedRevision == baseline.reminder?.revision
        else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createMealReminderRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_reminder_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readMealReminderRequest(lease: OfflineLease) throws -> SavedMealReminderRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_reminder_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealReminderRequest.self, from: data)
            .validated(member: mealReminderMember(lease))
    }

    /// Explicit online recovery only; reminders never join the automatic offline outbox.
    func stageMealReminderRequest(_ saved: SavedMealReminderRequest, lease: OfflineLease) throws {
        guard try readMealReminderRequest(lease: lease) == nil, saved.result == nil,
            !saved.cancellationRequested
        else { throw OfflineFailure.alreadyQueued }
        _ = try saved.validated(member: mealReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_reminder_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordMealReminderRecovery(_ result: MealReminderRecovery, lease: OfflineLease) throws {
        guard var saved = try readMealReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeMealReminderRequest(saved, lease: lease)
    }

    func requestMealReminderCancellation(lease: OfflineLease) throws {
        guard var saved = try readMealReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeMealReminderRequest(saved, lease: lease)
    }

    func finishMealReminderRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readMealReminderRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_reminder_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealReminderRequest(_ saved: SavedMealReminderRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: mealReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_reminder_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func mealReminderMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
