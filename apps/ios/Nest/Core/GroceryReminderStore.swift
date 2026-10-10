import Foundation

struct SavedGroceryReminderRequest: Codable, Equatable, Sendable {
    let baseline: GroceryReminderContext
    let command: SaveGroceryReminder
    var result: GroceryReminderRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try baseline.validated(member: member, id: command.itemId)
        _ = try command.validated()
        guard !baseline.grocery.checked, command.expectedItemVersion == baseline.itemVersion,
            command.expectedRevision == baseline.reminder?.revision
        else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createGroceryReminderRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_reminder_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readGroceryReminderRequest(lease: OfflineLease) throws -> SavedGroceryReminderRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM grocery_reminder_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedGroceryReminderRequest.self, from: data)
            .validated(member: groceryReminderMember(lease))
    }

    /// Explicit online recovery only; reminders never join the automatic offline outbox.
    func stageGroceryReminderRequest(_ saved: SavedGroceryReminderRequest, lease: OfflineLease) throws {
        guard try readGroceryReminderRequest(lease: lease) == nil, saved.result == nil,
            !saved.cancellationRequested
        else { throw OfflineFailure.alreadyQueued }
        _ = try saved.validated(member: groceryReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO grocery_reminder_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordGroceryReminderRecovery(_ result: GroceryReminderRecovery, lease: OfflineLease) throws {
        guard var saved = try readGroceryReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeGroceryReminderRequest(saved, lease: lease)
    }

    func requestGroceryReminderCancellation(lease: OfflineLease) throws {
        guard var saved = try readGroceryReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeGroceryReminderRequest(saved, lease: lease)
    }

    func finishGroceryReminderRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readGroceryReminderRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM grocery_reminder_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeGroceryReminderRequest(_ saved: SavedGroceryReminderRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: groceryReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE grocery_reminder_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func groceryReminderMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
