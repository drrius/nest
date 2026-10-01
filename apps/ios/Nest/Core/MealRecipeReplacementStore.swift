import Foundation

struct SavedMealRecipeReplacement: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let week: MealWeekSnapshot
    let meal: PlannedMeal
    let recipe: SavedRecipe
    let command: ReplaceSavedRecipe
    var state: State
    var receipt: MealRecipeReplacementReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try week.validated(household: lease.household, week: week.weekStart)
        _ = try command.validated(week: week, meal: meal, recipe: recipe)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    static func createMealReplacementTables(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_replacements (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_recipe_replacements (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readMealRecipeReplacement(lease: OfflineLease) throws -> SavedMealRecipeReplacement? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_recipe_replacements WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealRecipeReplacement.self, from: data).validated(lease)
    }

    func enqueueMealRecipeReplacement(_ saved: SavedMealRecipeReplacement, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        let start = saved.week.weekStart
        guard saved.state == .pending, try readMealRecipeReplacement(lease: lease) == nil,
            try readMealReplacement(lease: lease) == nil,
            try readMealMove(lease: lease) == nil, try readMealLeftovers(lease: lease) == nil,
            try readMealWeek(start, lease: lease) == saved.week,
            try readMealPlacement(start, lease: lease) == nil,
            try readMealRemoval(start, lease: lease) == nil,
            try readMealRecipePlacement(start, lease: lease) == nil
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_recipe_replacements(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeMealRecipeReplacement(_ receipt: MealRecipeReplacementReceipt, lease: OfflineLease) throws {
        guard var saved = try readMealRecipeReplacement(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeMealRecipeReplacement(saved, lease: lease)
    }

    func conflictMealRecipeReplacement(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMealRecipeReplacement(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeMealRecipeReplacement(saved, lease: lease)
    }

    func discardConflictedMealRecipeReplacement(lease: OfflineLease) throws {
        guard try readMealRecipeReplacement(lease: lease)?.state == .conflict
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_recipe_replacements WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealRecipeReplacement(_ saved: SavedMealRecipeReplacement, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_recipe_replacements SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func clearConfirmedMealRecipeReplacement(
        _ week: MealWeekSnapshot, retained: PlannedRecipeEnvelope?, lease: OfflineLease
    ) throws {
        _ = try week.validated(household: lease.household, week: week.weekStart)
        guard let saved = try readMealRecipeReplacement(lease: lease), let receipt = saved.receipt,
            receipt.weekStart == week.weekStart,
            let current = Int64(week.revision), let confirmed = Int64(receipt.revision), current >= confirmed,
            !week.entries.contains(where: { $0.id == receipt.previousEntryId })
        else { return }
        if current == confirmed {
            guard let retained, let snapshot = retained.snapshot,
                retained.entry?.id == receipt.entryId,
                retained.entry?.date == receipt.date, retained.entry?.slot == receipt.slot,
                snapshot.recipe.definitionId == receipt.definitionId,
                snapshot.libraryRevision == receipt.libraryRevision,
                snapshot.recipe.content == saved.recipe.content
            else { return }
            _ = try retained.validated(against: week, id: receipt.entryId)
        }
        try db.run("DELETE FROM meal_recipe_replacements WHERE actor=? AND household=?", lease.scope)
    }
}
