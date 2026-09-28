import Foundation

struct SavedRecipeArchive: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let command: ArchiveRecipe
    var state: State
    var receipt: RecipeArchiveReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated()
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readRecipeArchive(lease: OfflineLease) throws -> SavedRecipeArchive? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recipe_archives WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRecipeArchive.self, from: data).validated(lease)
    }

    func enqueueRecipeArchive(_ command: ArchiveRecipe, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecipeArchive(lease: lease) == nil, try readRecipeCreation(lease: lease) == nil else {
            throw OfflineFailure.alreadyQueued
        }
        let saved = SavedRecipeArchive(command: command, state: .pending, receipt: nil)
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recipe_archives(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRecipeArchive(_ receipt: RecipeArchiveReceipt, lease: OfflineLease) throws {
        guard var saved = try readRecipeArchive(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeRecipeArchive(saved, lease: lease)
    }

    func conflictRecipeArchive(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readRecipeArchive(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeRecipeArchive(saved, lease: lease)
    }

    func discardConflictedRecipeArchive(lease: OfflineLease) throws {
        guard try readRecipeArchive(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recipe_archives WHERE actor=? AND household=?", lease.scope)
    }

    func reconcileRecipeArchive(_ envelope: SavedRecipeEnvelope, lease: OfflineLease) throws {
        guard let saved = try readRecipeArchive(lease: lease), let receipt = saved.receipt else { return }
        let recipe = try envelope.validated(
            household: lease.household, definition: receipt.definitionId, revision: envelope.revision)
        guard let current = Int64(envelope.revision), let confirmed = Int64(receipt.revision), current >= confirmed
        else { return }
        guard current > confirmed || recipe == nil else { return }
        try db.run("DELETE FROM recipe_archives WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRecipeArchive(_ saved: SavedRecipeArchive, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recipe_archives SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

}
