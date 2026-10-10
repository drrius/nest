import Foundation

struct SavedLegacyDismissal: Codable, Sendable {
    let command: SaveLegacyDismissal
    let reviewed: LegacyDraftContext
    var result: LegacyDismissalRecovery?
    var cancellationRequested: Bool
}

extension ChoreOfflineStore {
    static func createLegacyDismissalTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_dismissal_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyDismissal(lease: OfflineLease) throws -> SavedLegacyDismissal? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM legacy_dismissal_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyDismissal.self, from: data)
        let member = legacyDismissalMember(lease)
        _ = try saved.reviewed.validated(member: member, draftId: saved.command.input.draftId)
        guard saved.reviewed.canDismiss, saved.reviewed.dismissalInput == saved.command.input else {
            throw OfflineFailure.invalidOperation
        }
        if let result = saved.result {
            _ = try result.validated(member: member, command: saved.command)
            if let receipt = result.receipt {
                _ = try receipt.validated(member: member, command: saved.command, review: saved.reviewed)
            }
        }
        return saved
    }

    func enqueueLegacyDismissal(_ command: SaveLegacyDismissal, reviewed: LegacyDraftContext, lease: OfflineLease)
        throws
    {
        try authorize(lease)
        _ = try reviewed.validated(member: legacyDismissalMember(lease), draftId: command.input.draftId)
        guard reviewed.canDismiss, reviewed.dismissalInput == command.input,
            try readLegacyDismissal(lease: lease) == nil
        else { throw OfflineFailure.invalidOperation }
        let saved = SavedLegacyDismissal(
            command: command, reviewed: reviewed, result: nil, cancellationRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO legacy_dismissal_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyDismissal(_ result: LegacyDismissalRecovery, lease: OfflineLease) throws {
        guard var saved = try readLegacyDismissal(lease: lease) else { throw OfflineFailure.invalidOperation }
        let member = legacyDismissalMember(lease)
        _ = try result.validated(member: member, command: saved.command)
        if let receipt = result.receipt {
            _ = try receipt.validated(member: member, command: saved.command, review: saved.reviewed)
        }
        if let previous = saved.result, previous.status != .unresolved {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try writeLegacyDismissal(saved, lease: lease)
    }

    func requestLegacyDismissalCancellation(lease: OfflineLease) throws {
        guard var saved = try readLegacyDismissal(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeLegacyDismissal(saved, lease: lease)
    }

    func finishLegacyDismissal(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyDismissal(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_dismissal_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeLegacyDismissal(_ saved: SavedLegacyDismissal, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE legacy_dismissal_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyDismissalMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
