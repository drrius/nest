import Foundation

struct SavedRecurringReminderRequest: Codable, Equatable, Sendable {
    let baseline: RecurringReminderContext
    let command: SaveRecurringReminder
    var result: RecurringReminderRecovery?
    var cancellationRequested = false

    func validated(member: VerifiedMember) throws -> Self {
        _ = try baseline.validated(member: member, id: command.ruleId)
        _ = try command.validated()
        guard baseline.rule.status == .active, command.expectedDueOn == baseline.rule.nextDueOn,
            command.expectedRuleRevision == baseline.rule.revision,
            command.expectedRevision == baseline.reminder?.revision
        else { throw OfflineFailure.storage }
        _ = try result?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createRecurringReminderRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS recurring_reminder_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRecurringReminderRequest(lease: OfflineLease) throws -> SavedRecurringReminderRequest? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM recurring_reminder_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRecurringReminderRequest.self, from: data)
            .validated(member: recurringReminderMember(lease))
    }

    /// Explicit online recovery only; reminders never join the automatic offline outbox.
    func stageRecurringReminderRequest(_ saved: SavedRecurringReminderRequest, lease: OfflineLease) throws {
        guard try readRecurringReminderRequest(lease: lease) == nil, saved.result == nil,
            !saved.cancellationRequested
        else { throw OfflineFailure.alreadyQueued }
        _ = try saved.validated(member: recurringReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recurring_reminder_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func recordRecurringReminderRecovery(_ result: RecurringReminderRecovery, lease: OfflineLease) throws {
        guard var saved = try readRecurringReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        if let previous = saved.result, previous.status != .unresolved {
            guard previous == result else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeRecurringReminderRequest(saved, lease: lease)
    }

    func requestRecurringReminderCancellation(lease: OfflineLease) throws {
        guard var saved = try readRecurringReminderRequest(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeRecurringReminderRequest(saved, lease: lease)
    }

    func finishRecurringReminderRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringReminderRequest(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_reminder_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRecurringReminderRequest(_ saved: SavedRecurringReminderRequest, lease: OfflineLease) throws {
        _ = try saved.validated(member: recurringReminderMember(lease))
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_reminder_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func recurringReminderMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
