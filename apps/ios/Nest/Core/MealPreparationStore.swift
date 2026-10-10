import Foundation

extension ChoreOfflineStore {
    func readMealPreparation(lease: OfflineLease) throws -> SavedMealPreparation? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM meal_preparations WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedMealPreparation.self, from: data).validated(lease)
    }

    func enqueueMealPreparation(
        _ command: MealPreparationCommand, baseline: MealPreparationEnvelope, lease: OfflineLease
    ) throws {
        guard try readMealPreparation(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = SavedMealPreparation(baseline: baseline, command: command, state: .pending, receipt: nil)
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO meal_preparations(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeMealPreparation(_ receipt: MealPreparationReceipt, lease: OfflineLease) throws {
        guard var saved = try readMealPreparation(lease: lease), saved.state == .pending
        else { throw OfflineFailure.invalidOperation }
        saved.state = .acknowledged
        saved.receipt = receipt
        try writeMealPreparation(saved, lease: lease)
    }

    func conflictMealPreparation(_ operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readMealPreparation(lease: lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.state = .conflict
        try writeMealPreparation(saved, lease: lease)
    }

    func discardMealPreparationConflict(lease: OfflineLease) throws {
        guard try readMealPreparation(lease: lease)?.state == .conflict else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM meal_preparations WHERE actor=? AND household=?", lease.scope)
    }

    func reconcileMealPreparation(_ current: MealPreparationEnvelope, lease: OfflineLease) throws {
        guard let saved = try readMealPreparation(lease: lease) else { return }
        _ = try current.validated(
            household: lease.household, week: saved.baseline.weekStart, id: saved.baseline.entryId)
        guard saved.reconciles(current) else { return }
        try db.run("DELETE FROM meal_preparations WHERE actor=? AND household=?", lease.scope)
    }

    private func writeMealPreparation(_ saved: SavedMealPreparation, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE meal_preparations SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
