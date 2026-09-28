import Foundation

struct SavedCookingPreference: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let baseline: CookingSlotsEnvelope
    let command: SaveCookingProfile
    var state: State
    var receipt: CookingSaveReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try baseline.validated(household: lease.household)
        _ = try command.validated()
        guard command.expectedRevision == (baseline.profile?.revision ?? "0"),
            (state == .acknowledged) == (receipt != nil)
        else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readCookingProfile(lease: OfflineLease) throws -> CookingSlotsEnvelope? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM cooking_profiles WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let profile = try JSONDecoder().decode(CookingSlotsEnvelope.self, from: data)
        _ = try profile.validated(household: lease.household)
        return profile
    }

    func saveCookingProfile(_ profile: CookingSlotsEnvelope, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try profile.validated(household: lease.household)
        let previous = try readCookingProfile(lease: lease)
        guard let revision = Int64(profile.profile?.revision ?? "0"),
            let old = Int64(previous?.profile?.revision ?? "0")
        else { throw OfflineFailure.storage }
        guard revision >= old else { return }
        let body = String(decoding: try JSONEncoder().encode(profile), as: UTF8.self)
        try db.transaction {
            try db.run(
                "INSERT INTO cooking_profiles(actor,household,body) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET body=excluded.body",
                lease.scope + [body])
            try reconcileCookingPreference(profile, lease: lease)
        }
    }

    func readCookingPreference(lease: OfflineLease) throws -> SavedCookingPreference? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM cooking_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedCookingPreference.self, from: data).validated(lease)
    }

    func enqueueCookingPreference(_ saved: SavedCookingPreference, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        guard saved.state == .pending, try readCookingPreference(lease: lease) == nil,
            try readCookingProfile(lease: lease) == saved.baseline
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO cooking_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeCookingPreference(_ receipt: CookingSaveReceipt, lease: OfflineLease) throws {
        guard var saved = try readCookingPreference(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.receipt = receipt
        saved.state = .acknowledged
        try writeCookingPreference(saved, lease: lease)
    }

    func conflictCookingPreference(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readCookingPreference(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeCookingPreference(saved, lease: lease)
    }

    func discardConflictedCookingPreference(lease: OfflineLease) throws {
        guard try readCookingPreference(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM cooking_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeCookingPreference(_ saved: SavedCookingPreference, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE cooking_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func reconcileCookingPreference(_ envelope: CookingSlotsEnvelope, lease: OfflineLease) throws {
        guard let saved = try readCookingPreference(lease: lease), let receipt = saved.receipt,
            let profile = envelope.profile, let current = Int64(profile.revision),
            let confirmed = Int64(receipt.revision), current >= confirmed
        else { return }
        guard current > confirmed || profile.preferences == saved.command.preferences else { return }
        try db.run("DELETE FROM cooking_commands WHERE actor=? AND household=?", lease.scope)
    }
}
