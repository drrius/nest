import Foundation

struct SavedMealRecipePlacement: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let week: MealWeekSnapshot
    let recipe: SavedRecipe
    let command: PlaceSavedRecipe
    let state: State
}

extension ChoreOfflineStore {
    func readMealRecipePlacement(
        _ start: MealWeekStart, lease: OfflineLease
    ) throws -> SavedMealRecipePlacement? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,week,recipe,body,status FROM meal_recipe_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [start.date.value])
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]),
            let weekData = row[1].data(using: .utf8),
            let recipeData = row[2].data(using: .utf8),
            let commandData = row[3].data(using: .utf8),
            let week = try? JSONDecoder().decode(MealWeekSnapshot.self, from: weekData)
                .validated(household: lease.household, week: start),
            let recipe = try? JSONDecoder().decode(SavedRecipe.self, from: recipeData)
                .validated(),
            let command = try? JSONDecoder().decode(PlaceSavedRecipe.self, from: commandData)
                .validated(against: week, recipe: recipe),
            command.operationId == operation,
            let state = SavedMealRecipePlacement.State(rawValue: row[4])
        else { throw OfflineFailure.storage }
        return SavedMealRecipePlacement(week: week, recipe: recipe, command: command, state: state)
    }

    func enqueueMealRecipePlacement(
        _ week: MealWeekSnapshot, recipe: SavedRecipe,
        command: PlaceSavedRecipe, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try command.validated(against: week, recipe: recipe)
        guard try readMealRecipePlacement(week.weekStart, lease: lease) == nil,
            try readMealPlacement(week.weekStart, lease: lease) == nil,
            try readMealRemoval(week.weekStart, lease: lease) == nil,
            try readMealWeek(week.weekStart, lease: lease) == week
        else { throw OfflineFailure.missingSnapshot }
        let capturedWeek = String(decoding: try JSONEncoder().encode(week), as: UTF8.self)
        let capturedRecipe = String(decoding: try JSONEncoder().encode(recipe), as: UTF8.self)
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        try db.run(
            "INSERT INTO meal_recipe_placements(actor,household,week_start,operation,week,recipe,body,status) VALUES(?,?,?,?,?,?,?,'pending')",
            lease.scope + [
                week.weekStart.date.value, command.operationId.uuidString.lowercased(),
                capturedWeek, capturedRecipe, body,
            ])
    }

    func acknowledgeMealRecipePlacement(
        _ receipt: MealRecipePlacementReceipt, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard let saved = try readMealRecipePlacement(receipt.weekStart, lease: lease),
            saved.state == .pending, receipt.version == 1,
            receipt.actorId == lease.actor, receipt.householdId == lease.household,
            receipt.operationId == saved.command.operationId,
            receipt.date == saved.command.date, receipt.slot == saved.command.slot,
            receipt.definitionId == saved.command.definitionId,
            receipt.libraryRevision == saved.command.expectedLibraryRevision,
            let previous = Int64(saved.command.expectedRevision), previous < Int64.max,
            receipt.revision == String(previous + 1)
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_recipe_placements SET status='acknowledged',confirmed_revision=?,entry_id=? WHERE actor=? AND household=? AND week_start=?",
            [receipt.revision, receipt.entryId.uuidString.lowercased()]
                + lease.scope + [receipt.weekStart.date.value])
    }

    func conflictMealRecipePlacement(
        _ operation: UUID, week: MealWeekStart, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard let saved = try readMealRecipePlacement(week, lease: lease),
            saved.state == .pending, saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_recipe_placements SET status='conflict',reason='rejected' WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    func discardConflictedMealRecipePlacement(
        _ week: MealWeekStart, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readMealRecipePlacement(week, lease: lease)?.state == .conflict
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "DELETE FROM meal_recipe_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    func clearConfirmedMealRecipePlacement(
        _ week: MealWeekSnapshot, lease: OfflineLease
    ) throws {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT confirmed_revision,entry_id,body,recipe FROM meal_recipe_placements WHERE actor=? AND household=? AND week_start=? AND status='acknowledged'",
            lease.scope + [week.weekStart.date.value])
        guard let row = rows.first else { return }
        guard let confirmed = Int64(row[0]), let current = Int64(week.revision),
            let entryId = UUID(uuidString: row[1]),
            let commandData = row[2].data(using: .utf8),
            let recipeData = row[3].data(using: .utf8),
            let command = try? JSONDecoder().decode(PlaceSavedRecipe.self, from: commandData),
            let recipe = try? JSONDecoder().decode(SavedRecipe.self, from: recipeData)
        else { throw OfflineFailure.storage }
        guard current >= confirmed else { return }
        if current == confirmed {
            guard
                week.entries.contains(where: {
                    $0.id == entryId && $0.date == command.date && $0.slot == command.slot
                        && $0.definitionId == command.definitionId && $0.title == recipe.title
                })
            else { return }
        }
        try db.run(
            "DELETE FROM meal_recipe_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.weekStart.date.value])
    }
}
