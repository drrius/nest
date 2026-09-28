import Foundation

struct SavedMealReplacement: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let week: MealWeekSnapshot
    let meal: PlannedMeal
    let command: ReplaceMeal
    var state: State
    var receipt: MealReplacementReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try week.validated(household: lease.household, week: week.weekStart)
        _ = try command.validated(week: week, meal: meal)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readMealReplacement(lease: OfflineLease) throws -> SavedMealReplacement? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_replacements WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealReplacement.self, from: data).validated(lease)
    }

    func enqueueMealReplacement(_ saved: SavedMealReplacement, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        let start = saved.week.weekStart
        guard saved.state == .pending, try readMealReplacement(lease: lease) == nil,
            try readMealMove(lease: lease) == nil,
            try readMealLeftovers(lease: lease) == nil,
            try readMealWeek(start, lease: lease) == saved.week,
            try readMealPlacement(start, lease: lease) == nil,
            try readMealRemoval(start, lease: lease) == nil,
            try readMealRecipePlacement(start, lease: lease) == nil
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_replacements(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeMealReplacement(_ receipt: MealReplacementReceipt, lease: OfflineLease) throws {
        guard var saved = try readMealReplacement(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeMealReplacement(saved, lease: lease)
    }

    func conflictMealReplacement(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMealReplacement(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeMealReplacement(saved, lease: lease)
    }

    func discardConflictedMealReplacement(lease: OfflineLease) throws {
        guard try readMealReplacement(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_replacements WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealReplacement(_ saved: SavedMealReplacement, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_replacements SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func clearConfirmedMealReplacement(_ week: MealWeekSnapshot, lease: OfflineLease) throws {
        guard let saved = try readMealReplacement(lease: lease), let receipt = saved.receipt,
            receipt.weekStart == week.weekStart,
            let current = Int64(week.revision), let confirmed = Int64(receipt.revision),
            current >= confirmed,
            !week.entries.contains(where: { $0.id == receipt.previousEntryId })
        else { return }
        if current == confirmed {
            guard let entry = week.entries.first(where: { $0.id == receipt.entryId }),
                entry.date == receipt.date, entry.slot == receipt.slot,
                entry.title == saved.command.title
            else { return }
        }
        try db.run("DELETE FROM meal_replacements WHERE actor=? AND household=?", lease.scope)
    }
}
