import Foundation

struct SavedMealRemoval: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let week: MealWeekSnapshot
    let meal: PlannedMeal
    let command: RemoveMeal
    let state: State
}

extension ChoreOfflineStore {
    func readMealRemoval(_ start: MealWeekStart, lease: OfflineLease) throws -> SavedMealRemoval? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,week,meal,body,status FROM meal_removals WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [start.date.value])
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]),
            let weekData = row[1].data(using: .utf8), let mealData = row[2].data(using: .utf8),
            let commandData = row[3].data(using: .utf8),
            let week = try? JSONDecoder().decode(MealWeekSnapshot.self, from: weekData)
                .validated(household: lease.household, week: start),
            let meal = try? JSONDecoder().decode(PlannedMeal.self, from: mealData),
            let command = try? JSONDecoder().decode(RemoveMeal.self, from: commandData)
                .validated(against: week, meal: meal),
            command.operationId == operation,
            let state = SavedMealRemoval.State(rawValue: row[4])
        else { throw OfflineFailure.storage }
        return SavedMealRemoval(week: week, meal: meal, command: command, state: state)
    }

    func enqueueMealRemoval(
        _ week: MealWeekSnapshot, meal: PlannedMeal,
        command: RemoveMeal, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try command.validated(against: week, meal: meal)
        guard try readMealRemoval(week.weekStart, lease: lease) == nil,
            try readMealPlacement(week.weekStart, lease: lease) == nil,
            try readMealWeek(week.weekStart, lease: lease) == week
        else { throw OfflineFailure.missingSnapshot }
        let capturedWeek = String(decoding: try JSONEncoder().encode(week), as: UTF8.self)
        let capturedMeal = String(decoding: try JSONEncoder().encode(meal), as: UTF8.self)
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        try db.run(
            "INSERT INTO meal_removals(actor,household,week_start,operation,week,meal,body,status) VALUES(?,?,?,?,?,?,?,'pending')",
            lease.scope + [
                week.weekStart.date.value, command.operationId.uuidString.lowercased(),
                capturedWeek, capturedMeal, body,
            ])
    }

    func acknowledgeMealRemoval(_ receipt: MealRemovalReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readMealRemoval(receipt.weekStart, lease: lease),
            saved.state == .pending, receipt.version == 1, receipt.removed,
            receipt.actorId == lease.actor, receipt.householdId == lease.household,
            receipt.operationId == saved.command.operationId,
            receipt.entryId == saved.meal.id,
            let previous = Int64(saved.command.expectedRevision), previous < Int64.max,
            receipt.revision == String(previous + 1)
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_removals SET status='acknowledged',confirmed_revision=? WHERE actor=? AND household=? AND week_start=?",
            [receipt.revision] + lease.scope + [receipt.weekStart.date.value])
    }

    func conflictMealRemoval(
        _ operation: UUID, week: MealWeekStart, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard let saved = try readMealRemoval(week, lease: lease),
            saved.state == .pending, saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_removals SET status='conflict',reason='rejected' WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    func discardConflictedMealRemoval(_ week: MealWeekStart, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readMealRemoval(week, lease: lease)?.state == .conflict
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "DELETE FROM meal_removals WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    func clearConfirmedMealRemoval(_ week: MealWeekSnapshot, lease: OfflineLease) throws {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT confirmed_revision,body FROM meal_removals WHERE actor=? AND household=? AND week_start=? AND status='acknowledged'",
            lease.scope + [week.weekStart.date.value])
        guard let row = rows.first else { return }
        guard let confirmed = Int64(row[0]), let current = Int64(week.revision),
            let data = row[1].data(using: .utf8),
            let command = try? JSONDecoder().decode(RemoveMeal.self, from: data)
        else { throw OfflineFailure.storage }
        guard current >= confirmed,
            !week.entries.contains(where: { $0.id == command.entryId })
        else { return }
        try db.run(
            "DELETE FROM meal_removals WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.weekStart.date.value])
    }
}
