import Foundation

struct SavedLegacyConfirmation: Codable, Sendable {
    let command: SaveLegacyConfirmation
    let reviewed: LegacyDraftContext
    var result: LegacyConfirmationRecovery?
    var cancellationRequested: Bool
}

extension ChoreOfflineStore {
    static func createLegacyConfirmationTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_confirmation_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyConfirmation(lease: OfflineLease) throws -> SavedLegacyConfirmation? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM legacy_confirmation_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyConfirmation.self, from: data)
        let member = legacyConfirmationMember(lease)
        _ = try saved.command.input.validated(member: member)
        _ = try saved.reviewed.validated(member: member, draftId: saved.command.input.draftId)
        guard saved.reviewed.canDismiss, saved.reviewed.dismissalInput == saved.command.input.retainedInput else {
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

    func enqueueLegacyConfirmation(_ command: SaveLegacyConfirmation, reviewed: LegacyDraftContext, lease: OfflineLease)
        throws
    {
        try authorize(lease)
        _ = try command.input.validated(member: legacyConfirmationMember(lease))
        _ = try reviewed.validated(member: legacyConfirmationMember(lease), draftId: command.input.draftId)
        guard reviewed.canDismiss, reviewed.dismissalInput == command.input.retainedInput,
            try readLegacyConfirmation(lease: lease) == nil
        else { throw OfflineFailure.invalidOperation }
        let saved = SavedLegacyConfirmation(
            command: command, reviewed: reviewed, result: nil, cancellationRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO legacy_confirmation_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyConfirmation(_ result: LegacyConfirmationRecovery, lease: OfflineLease) throws {
        guard var saved = try readLegacyConfirmation(lease: lease) else { throw OfflineFailure.invalidOperation }
        let member = legacyConfirmationMember(lease)
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
        try writeLegacyConfirmation(saved, lease: lease)
    }

    func requestLegacyConfirmationCancellation(lease: OfflineLease) throws {
        guard var saved = try readLegacyConfirmation(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeLegacyConfirmation(saved, lease: lease)
    }

    func finishLegacyConfirmation(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyConfirmation(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_confirmation_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeLegacyConfirmation(_ saved: SavedLegacyConfirmation, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE legacy_confirmation_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyConfirmationMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
