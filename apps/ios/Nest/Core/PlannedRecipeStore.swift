import Foundation

extension ChoreOfflineStore {
    func readPlannedRecipe(
        _ id: UUID, start: MealWeekStart, lease: OfflineLease
    ) throws -> PlannedRecipeEnvelope? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM planned_recipes WHERE actor=? AND household=? AND week_start=? AND entry_id=?",
            lease.scope + [start.date.value, id.uuidString.lowercased()])
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(PlannedRecipeEnvelope.self, from: data)
            .validated(household: lease.household, start: start, id: id)
    }

    func savePlannedRecipe(
        _ value: PlannedRecipeEnvelope, id: UUID, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try value.validated(household: lease.household, start: value.weekStart, id: id)
        if let previous = try readPlannedRecipe(id, start: value.weekStart, lease: lease),
            let old = Int64(previous.revision), let next = Int64(value.revision), old > next
        {
            return
        }
        let body = String(decoding: try JSONEncoder().encode(value), as: UTF8.self)
        try db.run(
            "INSERT INTO planned_recipes(actor,household,week_start,entry_id,body) VALUES(?,?,?,?,?) ON CONFLICT(actor,household,week_start,entry_id) DO UPDATE SET body=excluded.body",
            lease.scope + [value.weekStart.date.value, id.uuidString.lowercased(), body])
    }
}
