import Foundation

struct SavedFoodPreference: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let baseline: FoodProfileEnvelope
    let command: SaveFoodPreferences
    var state: State
    var receipt: FoodPreferenceReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try baseline.validated(
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""))
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
    func readFoodProfile(lease: OfflineLease) throws -> FoodProfileEnvelope? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM food_profiles WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let profile = try JSONDecoder().decode(FoodProfileEnvelope.self, from: data)
        _ = try profile.validated(
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""))
        return profile
    }

    func saveFoodProfile(_ profile: FoodProfileEnvelope, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try profile.validated(
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""))
        let previous = try readFoodProfile(lease: lease)
        guard let revision = Int64(profile.profile?.revision ?? "0"),
            let old = Int64(previous?.profile?.revision ?? "0")
        else { throw OfflineFailure.storage }
        guard revision >= old else { return }
        let body = String(decoding: try JSONEncoder().encode(profile), as: UTF8.self)
        try db.transaction {
            try db.run(
                "INSERT INTO food_profiles(actor,household,body) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET body=excluded.body",
                lease.scope + [body])
            try reconcileFoodPreference(profile, lease: lease)
        }
    }

    func readFoodPreference(lease: OfflineLease) throws -> SavedFoodPreference? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM food_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedFoodPreference.self, from: data).validated(lease)
    }

    func enqueueFoodPreference(_ saved: SavedFoodPreference, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        guard saved.state == .pending, try readFoodPreference(lease: lease) == nil,
            try readFoodProfile(lease: lease) == saved.baseline
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO food_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeFoodPreference(_ receipt: FoodPreferenceReceipt, lease: OfflineLease) throws {
        guard var saved = try readFoodPreference(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.receipt = receipt
        saved.state = .acknowledged
        try writeFoodPreference(saved, lease: lease)
    }

    func conflictFoodPreference(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readFoodPreference(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeFoodPreference(saved, lease: lease)
    }

    func discardConflictedFoodPreference(lease: OfflineLease) throws {
        guard try readFoodPreference(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM food_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeFoodPreference(_ saved: SavedFoodPreference, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE food_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func reconcileFoodPreference(_ envelope: FoodProfileEnvelope, lease: OfflineLease) throws {
        guard let saved = try readFoodPreference(lease: lease), let receipt = saved.receipt,
            let profile = envelope.profile, let current = Int64(profile.revision),
            let confirmed = Int64(receipt.revision), current >= confirmed
        else { return }
        guard current > confirmed || profile.preferences == saved.command.preferences else { return }
        try db.run("DELETE FROM food_commands WHERE actor=? AND household=?", lease.scope)
    }
}
