import Foundation

extension ChoreOfflineStore {
    static func createMealPreparationTables(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_preparations (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_preparation_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, entry_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household,week_start,entry_id))"
        )
    }

    func readPreparationSnapshot(entry: UUID, week: MealWeekStart, lease: OfflineLease) throws
        -> MealPreparationEnvelope?
    {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM meal_preparation_snapshots WHERE actor=? AND household=? AND week_start=? AND entry_id=?",
            lease.scope + [week.date.value, entry.uuidString.lowercased()])
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(MealPreparationEnvelope.self, from: data)
            .validated(household: lease.household, week: week, id: entry)
    }

    func savePreparationSnapshot(_ current: MealPreparationEnvelope, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try current.validated(household: lease.household, week: current.weekStart, id: current.entryId)
        try persistPreparationSnapshot(current, lease: lease)
    }

    func savePreparationRead(_ current: MealPreparationEnvelope, ticket: MealWeekReadTicket) throws -> Bool {
        try authorize(ticket.lease)
        _ = try current.validated(household: ticket.lease.household, week: ticket.start, id: current.entryId)
        return try db.transaction {
            guard try isCurrentMealWeekRead(ticket) else { return false }
            try persistPreparationSnapshot(current, lease: ticket.lease)
            return true
        }
    }

    private func persistPreparationSnapshot(_ current: MealPreparationEnvelope, lease: OfflineLease) throws {
        if let previous = try readPreparationSnapshot(entry: current.entryId, week: current.weekStart, lease: lease) {
            if Int64(previous.revision)! > Int64(current.revision)! { return }
            if previous.revision == current.revision, previous.preparation != nil, current.preparation == nil { return }
            if previous.revision == current.revision, let old = previous.preparation, let new = current.preparation,
                old.routineId == new.routineId, old.routineVersion > new.routineVersion
            {
                return
            }
        }
        let body = String(decoding: try JSONEncoder().encode(current), as: UTF8.self)
        try db.run(
            "INSERT INTO meal_preparation_snapshots(actor,household,week_start,entry_id,body) VALUES(?,?,?,?,?) ON CONFLICT(actor,household,week_start,entry_id) DO UPDATE SET body=excluded.body",
            lease.scope + [current.weekStart.date.value, current.entryId.uuidString.lowercased(), body])
    }
}
