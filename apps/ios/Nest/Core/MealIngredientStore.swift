import Foundation

struct SavedIngredientReview: Codable, Equatable, Sendable {
    let week: MealWeekStart
    var revision: String
    var choices: [MealIngredientChoice]
    var sequence: Int
    var pending: AddMealIngredients?
    var receipt: MealIngredientsReceipt?
    var conflicted: Bool

    func validated(_ lease: OfflineLease) throws -> Self {
        guard sequence > 0, MealRevision.valid(revision), choices.count <= 4200,
            Set(choices.map(\.id)).count == choices.count, !conflicted || pending != nil
        else { throw OfflineFailure.storage }
        guard
            choices.allSatisfy({
                MealLibraryText.valid($0.ingredient.quantity, maximum: 80)
                    && MealLibraryText.valid($0.ingredient.unit, maximum: 80)
            })
        else { throw OfflineFailure.storage }
        if let pending {
            _ = try pending.validated()
            guard pending.weekStart == week, pending.expectedRevision == revision,
                pending.selected == choices.filter(\.selected).map(\.ingredient), receipt == nil
            else { throw OfflineFailure.storage }
        }
        if let receipt {
            let command = AddMealIngredients(
                operationId: receipt.operationId, weekStart: week, expectedRevision: revision,
                selected: choices.filter(\.selected).map(\.ingredient))
            _ = try receipt.validated(
                member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""),
                command: command)
        }
        return self
    }
}

extension ChoreOfflineStore {
    func readIngredientReview(week: MealWeekStart, lease: OfflineLease) throws -> SavedIngredientReview? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM ingredient_reviews WHERE actor=? AND household=? AND week_start=?",
            lease.scope + [week.date.value])
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedIngredientReview.self, from: data).validated(lease)
        guard saved.week == week else { throw OfflineFailure.storage }
        return saved
    }

    func saveIngredientReview(
        week: MealWeekStart, revision: String, choices: [MealIngredientChoice],
        expectedSequence: Int?, lease: OfflineLease
    ) throws -> SavedIngredientReview {
        let prior = try readIngredientReview(week: week, lease: lease)
        guard prior?.pending == nil else { throw OfflineFailure.alreadyQueued }
        guard prior?.sequence == expectedSequence else { throw OfflineFailure.invalidOperation }
        let saved = SavedIngredientReview(
            week: week, revision: revision, choices: choices, sequence: try nextIngredientSequence(prior?.sequence),
            pending: nil, receipt: nil, conflicted: false)
        try writeIngredientReview(saved, lease: lease)
        return saved
    }

    func stageIngredientAddition(
        _ command: AddMealIngredients, expectedSequence: Int, lease: OfflineLease
    ) throws -> SavedIngredientReview {
        guard var saved = try readIngredientReview(week: command.weekStart, lease: lease),
            saved.sequence == expectedSequence
        else { throw OfflineFailure.invalidOperation }
        guard saved.pending == nil, saved.receipt == nil else { throw OfflineFailure.alreadyQueued }
        saved.pending = command
        saved.sequence = try nextIngredientSequence(saved.sequence)
        try writeIngredientReview(saved, lease: lease)
        return saved
    }

    func acknowledgeIngredientAddition(_ receipt: MealIngredientsReceipt, lease: OfflineLease) throws {
        guard var saved = try readIngredientReview(week: receipt.weekStart, lease: lease),
            let pending = saved.pending, !saved.conflicted
        else { throw OfflineFailure.invalidOperation }
        _ = try receipt.validated(
            member: VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: ""), command: pending
        )
        saved.pending = nil
        saved.receipt = receipt
        saved.sequence = try nextIngredientSequence(saved.sequence)
        try writeIngredientReview(saved, lease: lease)
    }

    func conflictIngredientAddition(week: MealWeekStart, operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readIngredientReview(week: week, lease: lease), saved.pending?.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.conflicted = true
        saved.sequence = try nextIngredientSequence(saved.sequence)
        try writeIngredientReview(saved, lease: lease)
    }

    func discardConflictedIngredientAddition(week: MealWeekStart, operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readIngredientReview(week: week, lease: lease),
            saved.conflicted, saved.pending?.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        saved.pending = nil
        saved.conflicted = false
        saved.sequence = try nextIngredientSequence(saved.sequence)
        try writeIngredientReview(saved, lease: lease)
    }

    private func nextIngredientSequence(_ value: Int?) throws -> Int {
        guard (value ?? 0) < Int.max else { throw OfflineFailure.storage }
        return (value ?? 0) + 1
    }

    private func writeIngredientReview(_ saved: SavedIngredientReview, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "INSERT OR REPLACE INTO ingredient_reviews(actor,household,week_start,body) VALUES(?,?,?,?)",
            lease.scope + [saved.week.date.value, body])
    }
}
