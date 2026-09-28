import Foundation

struct SavedRecipeCreation: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let command: CreateRecipe
    var state: State
    var receipt: RecipeCreationReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated()
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readRecipeCreation(lease: OfflineLease) throws -> SavedRecipeCreation? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recipe_creations WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRecipeCreation.self, from: data).validated(lease)
    }

    func enqueueRecipeCreation(_ command: CreateRecipe, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecipeCreation(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = SavedRecipeCreation(command: command, state: .pending, receipt: nil)
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recipe_creations(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRecipeCreation(_ receipt: RecipeCreationReceipt, lease: OfflineLease) throws {
        guard var saved = try readRecipeCreation(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeRecipeCreation(saved, lease: lease)
    }

    func conflictRecipeCreation(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readRecipeCreation(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeRecipeCreation(saved, lease: lease)
    }

    func discardConflictedRecipeCreation(lease: OfflineLease) throws {
        guard try readRecipeCreation(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recipe_creations WHERE actor=? AND household=?", lease.scope)
    }

    func reconcileRecipeCreation(_ envelope: SavedRecipeEnvelope, lease: OfflineLease) throws {
        guard let saved = try readRecipeCreation(lease: lease), let receipt = saved.receipt else { return }
        let recipe = try envelope.validated(
            household: lease.household, definition: receipt.definitionId, revision: envelope.revision)
        guard let current = Int64(envelope.revision), let confirmed = Int64(receipt.revision), current >= confirmed
        else { return }
        guard current > confirmed || recipe.map({ createdRecipeMatches($0, draft: saved.command.recipe) }) == true
        else { return }
        try db.run("DELETE FROM recipe_creations WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRecipeCreation(_ saved: SavedRecipeCreation, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recipe_creations SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func createdRecipeMatches(_ recipe: SavedRecipe, draft: RecipeDraft) -> Bool {
        guard recipe.title == draft.title, recipe.servings == draft.servings,
            recipe.instructions == draft.instructions, recipe.recipeUrl == draft.recipeUrl,
            recipe.notes == draft.notes, recipe.ingredients.count == draft.ingredients.count
        else { return false }
        return zip(recipe.ingredients, draft.ingredients).allSatisfy { saved, expected in
            saved.name == expected.name && saved.quantity == expected.quantity && saved.unit == expected.unit
                && saved.categoryId == expected.categoryId && saved.note == expected.note
        }
    }
}
