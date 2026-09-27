import Foundation

struct SavedMealMove: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let source: MealWeekSnapshot
    let target: MealWeekSnapshot
    let meal: PlannedMeal
    let command: MoveMeal
    var state: State
    var receipt: MealMoveReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try source.validated(household: lease.household, week: source.weekStart)
        _ = try command.validated(source: source, target: target, meal: meal)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readMealMove(lease: OfflineLease) throws -> SavedMealMove? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_moves WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealMove.self, from: data).validated(lease)
    }

    func enqueueMealMove(_ saved: SavedMealMove, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        guard saved.state == .pending, try readMealMove(lease: lease) == nil
        else { throw OfflineFailure.alreadyQueued }
        for week in [saved.source, saved.target] {
            guard try readMealWeek(week.weekStart, lease: lease) == week,
                try readMealPlacement(week.weekStart, lease: lease) == nil,
                try readMealRemoval(week.weekStart, lease: lease) == nil,
                try readMealRecipePlacement(week.weekStart, lease: lease) == nil
            else { throw OfflineFailure.missingSnapshot }
        }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_moves(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeMealMove(_ receipt: MealMoveReceipt, lease: OfflineLease) throws {
        guard var saved = try readMealMove(lease: lease), saved.state == .pending else {
            throw OfflineFailure.invalidOperation
        }
        saved.receipt = receipt
        saved.state = .acknowledged
        try writeMealMove(saved, lease: lease)
    }

    func conflictMealMove(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMealMove(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeMealMove(saved, lease: lease)
    }

    func discardConflictedMealMove(lease: OfflineLease) throws {
        guard try readMealMove(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_moves WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealMove(_ saved: SavedMealMove, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_moves SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func clearConfirmedMealMove(lease: OfflineLease) throws {
        guard let saved = try readMealMove(lease: lease), let receipt = saved.receipt,
            let source = try readMealWeek(saved.source.weekStart, lease: lease),
            let target = try readMealWeek(saved.target.weekStart, lease: lease),
            moveSourceConfirmed(source, receipt: receipt), moveTargetConfirmed(target, saved: saved)
        else { return }
        try db.run("DELETE FROM meal_moves WHERE actor=? AND household=?", lease.scope)
    }

    private func moveSourceConfirmed(_ week: MealWeekSnapshot, receipt: MealMoveReceipt) -> Bool {
        guard let current = Int64(week.revision), let confirmed = Int64(receipt.sourceRevision),
            current >= confirmed
        else { return false }
        if receipt.sourceWeekStart == receipt.targetWeekStart { return true }
        return current > confirmed || !week.entries.contains { $0.id == receipt.entryId }
    }

    private func moveTargetConfirmed(_ week: MealWeekSnapshot, saved: SavedMealMove) -> Bool {
        guard let receipt = saved.receipt, let current = Int64(week.revision),
            let confirmed = Int64(receipt.targetRevision), current >= confirmed
        else { return false }
        if current > confirmed { return true }
        let moved = PlannedMeal(
            entryId: saved.meal.id, date: receipt.date, slot: receipt.slot,
            title: saved.meal.title, recipeUrl: saved.meal.recipeUrl, notes: saved.meal.notes,
            definitionId: saved.meal.definitionId, leftoverSourceId: saved.meal.leftoverSourceId)
        return week.entries.contains(moved)
    }
}
