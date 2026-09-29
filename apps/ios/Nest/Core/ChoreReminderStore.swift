import Foundation

struct SavedChoreReminderRequest: Codable, Equatable, Sendable {
    let baseline: ChoreReminderContext
    let command: SaveChoreReminder
    var result: ChoreReminderRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try baseline.validated(member: member, id: command.occurrenceId)
        _ = try command.validated()
        guard command.expectedItemRevision == baseline.itemRevision,
            command.expectedRevision == baseline.reminder?.revision
        else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createChoreReminderRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS chore_reminder_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readChoreReminderRequest(lease: OfflineLease) throws -> SavedChoreReminderRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM chore_reminder_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedChoreReminderRequest.self, from: data)
            .validated(member: choreReminderMember(lease))
    }

    /// Explicit online recovery only; reminders never join the automatic offline outbox.
    func stageChoreReminderRequest(_ saved: SavedChoreReminderRequest, lease: OfflineLease) throws {
        guard try readChoreReminderRequest(lease: lease) == nil, saved.result == nil,
            !saved.cancellationRequested
        else { throw OfflineFailure.alreadyQueued }
        _ = try saved.validated(member: choreReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO chore_reminder_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordChoreReminderRecovery(_ result: ChoreReminderRecovery, lease: OfflineLease) throws {
        guard var saved = try readChoreReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeChoreReminderRequest(saved, lease: lease)
    }

    func requestChoreReminderCancellation(lease: OfflineLease) throws {
        guard var saved = try readChoreReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeChoreReminderRequest(saved, lease: lease)
    }

    func finishChoreReminderRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readChoreReminderRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM chore_reminder_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeChoreReminderRequest(_ saved: SavedChoreReminderRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: choreReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE chore_reminder_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func choreReminderMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
