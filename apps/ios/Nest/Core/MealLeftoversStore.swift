import Foundation

struct SavedMealLeftovers: Codable, Equatable, Sendable {
    enum State: String, Codable, Sendable { case pending, acknowledged, conflict }
    let source: MealWeekSnapshot
    let target: MealWeekSnapshot
    let meal: PlannedMeal
    let placement: PlaceLeftovers
    var state: State
    var receipt: LeftoverPlacementReceipt?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try source.validated(household: lease.household, week: source.weekStart)
        _ = try placement.validated(source: source, target: target, meal: meal)
        guard (state == .acknowledged) == (receipt != nil) else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, placement: placement)
        return self
    }
}

extension ChoreOfflineStore {
    func readMealLeftovers(lease: OfflineLease) throws -> SavedMealLeftovers? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_leftovers WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealLeftovers.self, from: data).validated(lease)
    }

    func enqueueMealLeftovers(_ saved: SavedMealLeftovers, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        guard try readMealRecipeReplacement(lease: lease) == nil,
            saved.state == .pending, try readMealLeftovers(lease: lease) == nil,
            try readMealReplacement(lease: lease) == nil,
            try readMealMove(lease: lease) == nil
        else { throw OfflineFailure.alreadyQueued }
        for week in [saved.source, saved.target] {
            guard try readMealWeek(week.weekStart, lease: lease) == week,
                try readMealPlacement(week.weekStart, lease: lease) == nil,
                try readMealRemoval(week.weekStart, lease: lease) == nil,
                try readMealRecipePlacement(week.weekStart, lease: lease) == nil
            else { throw OfflineFailure.missingSnapshot }
        }
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_leftovers(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeMealLeftovers(_ receipt: LeftoverPlacementReceipt, lease: OfflineLease) throws {
        guard var saved = try readMealLeftovers(lease: lease), saved.state == .pending else {
            throw OfflineFailure.invalidOperation
        }
        saved.receipt = receipt
        saved.state = .acknowledged
        try writeMealLeftovers(saved, lease: lease)
    }

    func conflictMealLeftovers(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMealLeftovers(lease: lease), saved.state == .pending,
            saved.placement.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeMealLeftovers(saved, lease: lease)
    }

    func discardConflictedMealLeftovers(lease: OfflineLease) throws {
        guard try readMealLeftovers(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_leftovers WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealLeftovers(_ saved: SavedMealLeftovers, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_leftovers SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func clearConfirmedMealLeftovers(lease: OfflineLease) throws {
        guard let saved = try readMealLeftovers(lease: lease), saved.receipt != nil,
            let source = try readMealWeek(saved.source.weekStart, lease: lease),
            let target = try readMealWeek(saved.target.weekStart, lease: lease),
            leftoverSourceConfirmed(source, saved: saved), leftoverTargetConfirmed(target, saved: saved)
        else { return }
        try db.run("DELETE FROM meal_leftovers WHERE actor=? AND household=?", lease.scope)
    }

    private func leftoverSourceConfirmed(_ week: MealWeekSnapshot, saved: SavedMealLeftovers) -> Bool {
        guard let receipt = saved.receipt, let current = Int64(week.revision),
            let confirmed = Int64(receipt.sourceRevision), current >= confirmed
        else { return false }
        return current > confirmed || week.entries.contains(saved.meal)
    }

    private func leftoverTargetConfirmed(_ week: MealWeekSnapshot, saved: SavedMealLeftovers) -> Bool {
        guard let receipt = saved.receipt, let current = Int64(week.revision),
            let confirmed = Int64(receipt.targetRevision), current >= confirmed
        else { return false }
        if current > confirmed { return true }
        let moved = PlannedMeal(
            entryId: receipt.entryId, date: receipt.date, slot: receipt.slot,
            title: saved.meal.title, recipeUrl: saved.meal.recipeUrl, notes: saved.meal.notes,
            definitionId: saved.meal.definitionId, leftoverSourceId: saved.meal.id)
        return week.entries.contains(moved)
    }
}
