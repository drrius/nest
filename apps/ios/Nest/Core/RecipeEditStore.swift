import Foundation

struct SavedRecipeEdit: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let baseline: SavedRecipe
    let command: EditRecipe
    var state: State
    var receipt: RecipeEditReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated(against: baseline)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readRecipeEdit(lease: OfflineLease) throws -> SavedRecipeEdit? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recipe_edits WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRecipeEdit.self, from: data).validated(lease)
    }

    func enqueueRecipeEdit(_ command: EditRecipe, baseline: SavedRecipe, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecipeEdit(lease: lease) == nil, try readRecipeCreation(lease: lease) == nil,
            try readRecipeArchive(lease: lease) == nil
        else {
            throw OfflineFailure.alreadyQueued
        }
        let saved = SavedRecipeEdit(baseline: baseline, command: command, state: .pending, receipt: nil)
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recipe_edits(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRecipeEdit(_ receipt: RecipeEditReceipt, lease: OfflineLease) throws {
        guard var saved = try readRecipeEdit(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeRecipeEdit(saved, lease: lease)
    }

    func conflictRecipeEdit(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readRecipeEdit(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeRecipeEdit(saved, lease: lease)
    }

    func discardConflictedRecipeEdit(lease: OfflineLease) throws {
        guard try readRecipeEdit(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recipe_edits WHERE actor=? AND household=?", lease.scope)
    }

    func reconcileRecipeEdit(_ envelope: SavedRecipeEnvelope, lease: OfflineLease) throws {
        guard let saved = try readRecipeEdit(lease: lease), let receipt = saved.receipt else { return }
        let recipe = try envelope.validated(
            household: lease.household, definition: receipt.definitionId, revision: envelope.revision)
        guard let current = Int64(envelope.revision), let confirmed = Int64(receipt.revision), current >= confirmed
        else { return }
        guard current > confirmed || recipe.map({ saved.command.matches($0, baseline: saved.baseline) }) == true else {
            return
        }
        try db.run("DELETE FROM recipe_edits WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRecipeEdit(_ saved: SavedRecipeEdit, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recipe_edits SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

}
