import Foundation

struct SavedRenewalReminderRequest: Codable, Equatable, Sendable {
    let renewal: CalendarRenewal
    let baseline: RenewalReminderEnvelope
    let command: SaveRenewalReminder
    var result: RenewalReminderRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try renewal.validated()
        _ = try baseline.validated(member: member, id: renewal.id)
        _ = try command.validated()
        guard !renewal.removed, command.renewalId == renewal.id,
            command.expectedRenewalRevision == renewal.revision,
            command.expectedRevision == baseline.reminder?.revision
        else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createRenewalReminderRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS renewal_reminder_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRenewalReminderRequest(lease: OfflineLease) throws -> SavedRenewalReminderRequest? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM renewal_reminder_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRenewalReminderRequest.self, from: data)
            .validated(member: reminderMember(lease))
    }

    /// Explicit online recovery only; reminders never join the automatic offline outbox.
    func stageRenewalReminderRequest(_ saved: SavedRenewalReminderRequest, lease: OfflineLease) throws {
        guard try readRenewalReminderRequest(lease: lease) == nil, saved.result == nil,
            !saved.cancellationRequested
        else { throw OfflineFailure.alreadyQueued }
        _ = try saved.validated(member: reminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO renewal_reminder_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordRenewalReminderRecovery(_ result: RenewalReminderRecovery, lease: OfflineLease) throws {
        guard var saved = try readRenewalReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeRenewalReminderRequest(saved, lease: lease)
    }

    func requestRenewalReminderCancellation(lease: OfflineLease) throws {
        guard var saved = try readRenewalReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeRenewalReminderRequest(saved, lease: lease)
    }

    func finishRenewalReminderRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRenewalReminderRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM renewal_reminder_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRenewalReminderRequest(_ saved: SavedRenewalReminderRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: reminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE renewal_reminder_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func reminderMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
