import Foundation

struct SavedNotificationPreference: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let baseline: NotificationProfileEnvelope
    let command: SaveNotificationPreferences
    var state: State
    var receipt: NotificationPreferenceReceipt?

    func validated(lease: OfflineLease) throws -> Self {
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try baseline.validated(member: member)
        _ = try command.validated()
        guard command.expectedRevision == (baseline.profile?.revision ?? "0"),
            (state == .acknowledged) == (receipt != nil)
        else { throw OfflineFailure.storage }
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createNotificationRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS notification_requests (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readNotificationRequest(lease: OfflineLease) throws -> SavedNotificationPreference? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM notification_requests WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedNotificationPreference.self, from: data).validated(lease: lease)
    }

    /// Recovery only: notification choices are never dispatched by the automatic offline outbox.
    func stageNotificationRequest(_ saved: SavedNotificationPreference, lease: OfflineLease) throws {
        guard try readNotificationRequest(lease: lease) == nil, saved.state == .pending else {
            throw OfflineFailure.alreadyQueued
        }
        _ = try saved.validated(lease: lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO notification_requests(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeNotificationRequest(_ receipt: NotificationPreferenceReceipt, lease: OfflineLease) throws {
        guard var saved = try readNotificationRequest(lease: lease), saved.state == .pending else {
            throw OfflineFailure.invalidOperation
        }
        saved.receipt = receipt
        saved.state = .acknowledged
        try writeNotificationRequest(saved, lease: lease)
    }

    func conflictNotificationRequest(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readNotificationRequest(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeNotificationRequest(saved, lease: lease)
    }

    func finishNotificationRequest(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readNotificationRequest(lease: lease), saved.state != .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM notification_requests WHERE actor=? AND household=?", lease.scope)
    }

    private func writeNotificationRequest(_ saved: SavedNotificationPreference, lease: OfflineLease) throws {
        _ = try saved.validated(lease: lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE notification_requests SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
