import Foundation

struct SavedLegacyAdoption: Codable, Sendable {
    let command: SaveLegacyAdoption
    let reviewed: LegacyAdoptionContext
    var result: LegacyAdoptionRecovery?
    var cancellationRequested: Bool
}

extension ChoreOfflineStore {
    static func createLegacyAdoptionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_adoption_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyAdoption(lease: OfflineLease) throws -> SavedLegacyAdoption? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM legacy_adoption_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyAdoption.self, from: data)
        let member = legacyAdoptionMember(lease)
        _ = try saved.command.input.validated(member: member, review: saved.reviewed)
        _ = try saved.reviewed.validated(member: member, ruleId: saved.command.input.ruleId)
        guard saved.reviewed.canAdopt, saved.reviewed.rule.id == saved.command.input.ruleId,
            saved.reviewed.reviewToken == saved.command.input.reviewToken
        else {
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

    func enqueueLegacyAdoption(_ command: SaveLegacyAdoption, reviewed: LegacyAdoptionContext, lease: OfflineLease)
        throws
    {
        try authorize(lease)
        _ = try command.input.validated(member: legacyAdoptionMember(lease), review: reviewed)
        _ = try reviewed.validated(member: legacyAdoptionMember(lease), ruleId: command.input.ruleId)
        guard reviewed.canAdopt, reviewed.rule.id == command.input.ruleId,
            reviewed.reviewToken == command.input.reviewToken,
            try readLegacyAdoption(lease: lease) == nil
        else { throw OfflineFailure.invalidOperation }
        let saved = SavedLegacyAdoption(
            command: command, reviewed: reviewed, result: nil, cancellationRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO legacy_adoption_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyAdoption(_ result: LegacyAdoptionRecovery, lease: OfflineLease) throws {
        guard var saved = try readLegacyAdoption(lease: lease) else { throw OfflineFailure.invalidOperation }
        let member = legacyAdoptionMember(lease)
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
        try writeLegacyAdoption(saved, lease: lease)
    }

    func requestLegacyAdoptionCancellation(lease: OfflineLease) throws {
        guard var saved = try readLegacyAdoption(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        try writeLegacyAdoption(saved, lease: lease)
    }

    func finishLegacyAdoption(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyAdoption(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_adoption_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeLegacyAdoption(_ saved: SavedLegacyAdoption, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE legacy_adoption_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyAdoptionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
