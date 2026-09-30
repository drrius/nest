import Foundation

/// Removal intent is independent of an uncertain enable. It never authorizes publishing.
struct CalendarPrivacyRemoval: Codable, Equatable, Sendable {
    let id: UUID
    var command: SetCalendarConsent?
    let requiresFence: Bool
}

enum CalendarPrivacySchema {
    static func create(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS calendar_consent_changes (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS calendar_privacy_removals (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }
}

extension ChoreOfflineStore {
    func readCalendarPrivacyRemoval(lease: OfflineLease) throws -> CalendarPrivacyRemoval? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM calendar_privacy_removals WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first else { return nil }
        let saved = try JSONDecoder().decode(CalendarPrivacyRemoval.self, from: Data(body.utf8))
        if let command = saved.command {
            _ = try command.validated()
            guard !command.enabled else { throw OfflineFailure.invalidOperation }
        }
        return saved
    }

    func rememberCalendarPermissionLoss(lease: OfflineLease) throws {
        guard try readCalendarPrivacyRemoval(lease: lease) == nil else { return }
        let requiresFence = try readCalendarConsentChange(lease: lease) != nil
        try writeCalendarPrivacyRemoval(.init(id: UUID(), command: nil, requiresFence: requiresFence), lease: lease)
    }

    func stageCalendarPrivacyRemoval(current: CalendarConsent, lease: OfflineLease) throws -> SetCalendarConsent {
        guard var saved = try readCalendarPrivacyRemoval(lease: lease), saved.command == nil else {
            throw OfflineFailure.invalidOperation
        }
        _ = try current.validated()
        let command = try SetCalendarConsent(
            incarnation: current.incarnation, operationId: UUID(), expectedRevision: current.version, enabled: false
        ).validated()
        saved.command = command
        try writeCalendarPrivacyRemoval(saved, lease: lease)
        return command
    }

    func rejectCalendarPrivacyRemoval(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readCalendarPrivacyRemoval(lease: lease), saved.command?.operationId == operation else {
            throw OfflineFailure.invalidOperation
        }
        saved.command = nil
        try writeCalendarPrivacyRemoval(saved, lease: lease)
    }

    func confirmCalendarPrivacyRemoval(_ receipt: CalendarConsentReceipt, lease: OfflineLease) throws {
        guard let saved = try readCalendarPrivacyRemoval(lease: lease), let command = saved.command else {
            throw OfflineFailure.invalidOperation
        }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        let consent = try receipt.validated(member: member, command: command)
        try db.transaction {
            if let pending = try readCalendarConsentChange(lease: lease) {
                // The validated off receipt advances the server revision. An older request
                // cannot mutate after this fence, including a delayed, previously sent enable.
                guard try calendarRequestSuperseded(pending.command, by: consent) else {
                    throw OfflineFailure.invalidOperation
                }
                try db.run("DELETE FROM calendar_consent_changes WHERE actor=? AND household=?", lease.scope)
            }
            try db.run("DELETE FROM calendar_privacy_removals WHERE actor=? AND household=?", lease.scope)
        }
    }

    func clearUnneededCalendarPrivacyRemoval(_ current: CalendarConsent, lease: OfflineLease) throws {
        _ = try current.validated()
        guard !current.enabled, try readCalendarConsentChange(lease: lease) == nil,
            let saved = try readCalendarPrivacyRemoval(lease: lease), saved.command == nil, !saved.requiresFence
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM calendar_privacy_removals WHERE actor=? AND household=?", lease.scope)
    }

    private func writeCalendarPrivacyRemoval(_ saved: CalendarPrivacyRemoval, lease: OfflineLease) throws {
        try authorize(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "INSERT INTO calendar_privacy_removals(actor,household,body) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET body=excluded.body",
            lease.scope + [body])
    }

    private func calendarRequestSuperseded(_ command: SetCalendarConsent, by consent: CalendarConsent) throws -> Bool {
        if command.incarnation != consent.incarnation { return true }
        return try CalendarConsent.revision(command.expectedRevision) < CalendarConsent.revision(consent.version)
    }
}
