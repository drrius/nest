import Foundation

struct MealWeekReadTicket: Sendable {
    let start: MealWeekStart
    let lease: OfflineLease
    fileprivate let epoch: UUID
}

extension ChoreOfflineStore {
    static func createMealWeekReadTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_week_read_epochs (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, epoch TEXT NOT NULL, PRIMARY KEY(actor,household,week_start))"
        )
    }

    func beginMealWeekRead(_ start: MealWeekStart, lease: OfflineLease) throws -> MealWeekReadTicket {
        try authorize(lease)
        try db.run(
            "INSERT INTO meal_week_read_epochs(actor,household,week_start,epoch) VALUES(?,?,?,?) ON CONFLICT(actor,household,week_start) DO NOTHING",
            lease.scope + [start.date.value, UUID().uuidString.lowercased()])
        let rows = try db.rows(
            "SELECT epoch FROM meal_week_read_epochs WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [start.date.value])
        guard let raw = rows.first?.first, let epoch = UUID(uuidString: raw) else { throw OfflineFailure.storage }
        return MealWeekReadTicket(start: start, lease: lease, epoch: epoch)
    }

    func isCurrentMealWeekRead(_ ticket: MealWeekReadTicket) throws -> Bool {
        try authorize(ticket.lease)
        let rows = try db.rows(
            "SELECT epoch FROM meal_week_read_epochs WHERE actor=? AND household=? AND week_start=?",
            ticket.lease.scope + [ticket.start.date.value])
        return rows.first?.first == ticket.epoch.uuidString.lowercased()
    }

    func advanceMealWeekReadEpoch(_ start: MealWeekStart, lease: OfflineLease) throws {
        try authorize(lease)
        try db.run(
            "INSERT INTO meal_week_read_epochs(actor,household,week_start,epoch) VALUES(?,?,?,?) ON CONFLICT(actor,household,week_start) DO UPDATE SET epoch=excluded.epoch",
            lease.scope + [start.date.value, UUID().uuidString.lowercased()])
    }
}
