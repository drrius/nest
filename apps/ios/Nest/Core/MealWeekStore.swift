import Foundation

struct SavedMealPlacement: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let week: MealWeekSnapshot
    let command: PlaceMeal
    let state: State
}

extension ChoreOfflineStore {
    func readMealWeek(_ start: MealWeekStart, lease: OfflineLease) throws -> MealWeekSnapshot? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM meal_weeks WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [start.date.value])
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: data)
            .validated(household: lease.household, week: start)
    }

    func saveMealWeek(_ week: MealWeekSnapshot, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try week.validated(household: lease.household, week: week.weekStart)
        if let previous = try readMealWeek(week.weekStart, lease: lease),
            let oldRevision = Int64(previous.revision), let newRevision = Int64(week.revision),
            oldRevision > newRevision
        {
            return
        }
        let body = String(decoding: try JSONEncoder().encode(week), as: UTF8.self)
        try db.transaction {
            try db.run(
                "INSERT INTO meal_weeks(actor,household,week_start,body) VALUES(?,?,?,?) ON CONFLICT(actor,household,week_start) DO UPDATE SET body=excluded.body",
                lease.scope + [week.weekStart.date.value, body])
            try clearConfirmedMealPlacement(week, lease: lease)
            try clearConfirmedMealRemoval(week, lease: lease)
            try clearConfirmedMealRecipePlacement(week, lease: lease)
            try clearConfirmedMealMove(lease: lease)
            try clearConfirmedMealLeftovers(lease: lease)
            try clearConfirmedMealReplacement(week, lease: lease)
        }
    }

    func readMealPlacement(_ start: MealWeekStart, lease: OfflineLease) throws -> SavedMealPlacement? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,week,body,status FROM meal_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [start.date.value])
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]),
            let weekData = row[1].data(using: .utf8), let commandData = row[2].data(using: .utf8),
            let week = try? JSONDecoder().decode(MealWeekSnapshot.self, from: weekData)
                .validated(household: lease.household, week: start),
            let command = try? JSONDecoder().decode(PlaceMeal.self, from: commandData)
                .validated(against: week),
            command.operationId == operation,
            let state = SavedMealPlacement.State(rawValue: row[3])
        else { throw OfflineFailure.storage }
        return SavedMealPlacement(week: week, command: command, state: state)
    }

    func enqueueMealPlacement(
        _ week: MealWeekSnapshot, command: PlaceMeal, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try command.validated(against: week)
        guard try readMealRecipeReplacement(lease: lease) == nil,
            try readMealReplacement(lease: lease) == nil,
            try readMealMove(lease: lease) == nil,
            try readMealLeftovers(lease: lease) == nil,
            try readMealPlacement(week.weekStart, lease: lease) == nil,
            try readMealRemoval(week.weekStart, lease: lease) == nil,
            try readMealRecipePlacement(week.weekStart, lease: lease) == nil,
            try readMealWeek(week.weekStart, lease: lease) == week
        else { throw OfflineFailure.missingSnapshot }
        let captured = String(decoding: try JSONEncoder().encode(week), as: UTF8.self)
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        try db.run(
            "INSERT INTO meal_placements(actor,household,week_start,operation,week,body,status) VALUES(?,?,?,?,?,?,'pending')",
            lease.scope + [week.weekStart.date.value, command.operationId.uuidString.lowercased(), captured, body])
    }

    func acknowledgeMealPlacement(
        _ receipt: MealPlacementReceipt, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard let saved = try readMealPlacement(receipt.weekStart, lease: lease),
            saved.state == .pending, receipt.version == 1,
            receipt.actorId == lease.actor, receipt.householdId == lease.household,
            receipt.operationId == saved.command.operationId,
            receipt.date == saved.command.date, receipt.slot == saved.command.slot,
            let previous = Int64(saved.command.expectedRevision), previous < Int64.max,
            receipt.revision == String(previous + 1)
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_placements SET status='acknowledged',confirmed_revision=?,entry_id=? WHERE actor=? AND household=? AND week_start=?",
            [receipt.revision, receipt.entryId.uuidString.lowercased()]
                + lease.scope + [receipt.weekStart.date.value])
    }

    func conflictMealPlacement(
        _ operation: UUID, week: MealWeekStart, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard let saved = try readMealPlacement(week, lease: lease),
            saved.state == .pending, saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE meal_placements SET status='conflict',reason='rejected' WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    func discardConflictedMealPlacement(_ week: MealWeekStart, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readMealPlacement(week, lease: lease)?.state == .conflict
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "DELETE FROM meal_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
    }

    private func clearConfirmedMealPlacement(_ week: MealWeekSnapshot, lease: OfflineLease) throws {
        let rows = try db.rows(
            "SELECT confirmed_revision,entry_id,body FROM meal_placements WHERE actor=? AND household=? AND week_start=? AND status='acknowledged'",
            lease.scope + [week.weekStart.date.value])
        guard let row = rows.first else { return }
        guard let confirmed = Int64(row[0]), let current = Int64(week.revision),
            let entryId = UUID(uuidString: row[1]), let data = row[2].data(using: .utf8),
            let command = try? JSONDecoder().decode(PlaceMeal.self, from: data)
        else { throw OfflineFailure.storage }
        guard current >= confirmed else { return }
        if current == confirmed {
            guard
                week.entries.contains(where: {
                    $0.id == entryId && $0.date == command.date && $0.slot == command.slot
                        && $0.title == command.title
                })
            else { return }
        }
        try db.run(
            "DELETE FROM meal_placements WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.weekStart.date.value])
    }
}
