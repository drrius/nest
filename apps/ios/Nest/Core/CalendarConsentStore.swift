import Foundation

struct SavedCalendarConsent: Codable, Sendable {
    let command: SetCalendarConsent
    var conflict: Bool
}

extension ChoreOfflineStore {
    func readCalendarConsentChange(lease: OfflineLease) throws -> SavedCalendarConsent? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM calendar_consent_changes WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedCalendarConsent.self, from: data)
        _ = try saved.command.validated()
        return saved
    }

    func enqueueCalendarConsentChange(
        current: CalendarConsent, enabled: Bool, operation: UUID, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readCalendarConsentChange(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try current.validated()
        let command = try SetCalendarConsent(
            incarnation: current.incarnation, operationId: operation,
            expectedRevision: current.version, enabled: enabled
        ).validated()
        let saved = SavedCalendarConsent(command: command, conflict: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO calendar_consent_changes(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func confirmCalendarConsentChange(_ receipt: CalendarConsentReceipt, lease: OfflineLease) throws {
        guard let saved = try readCalendarConsentChange(lease: lease), !saved.conflict else {
            throw OfflineFailure.invalidOperation
        }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt.validated(member: member, command: saved.command)
        try db.run("DELETE FROM calendar_consent_changes WHERE actor=? AND household=?", lease.scope)
    }

    func conflictCalendarConsentChange(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readCalendarConsentChange(lease: lease), saved.command.operationId == operation else {
            throw OfflineFailure.invalidOperation
        }
        saved.conflict = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE calendar_consent_changes SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func discardRejectedCalendarConsentChange(lease: OfflineLease) throws {
        guard try readCalendarConsentChange(lease: lease)?.conflict == true else {
            throw OfflineFailure.invalidOperation
        }
        try db.run("DELETE FROM calendar_consent_changes WHERE actor=? AND household=?", lease.scope)
    }
}
