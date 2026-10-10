import Foundation

struct RecipeReadTarget<Value: Codable & Sendable>: Sendable {
    let member: VerifiedMember
    fileprivate let key: String
    fileprivate let validate: @Sendable (Value) throws -> Value

    private init(member: VerifiedMember, key: String, validate: @escaping @Sendable (Value) throws -> Value) {
        self.member = member
        self.key = key
        self.validate = validate
    }
}

struct RecipeReadTicket<Value: Codable & Sendable>: Sendable {
    fileprivate let target: RecipeReadTarget<Value>
    fileprivate let attempt: UUID
    let lease: OfflineLease
}

struct SavedRecipeRead<Value: Codable & Sendable>: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let value: Value
    let savedAt: Date
}

extension RecipeReadTarget where Value == MealLibraryListing {
    static func library(_ member: VerifiedMember) -> Self {
        Self(member: member, key: "library") {
            guard $0.householdId == member.householdId else { throw MealLibraryError.invalidResponse }
            return try $0.validated()
        }
    }
}

extension RecipeReadTarget where Value == SavedRecipe? {
    static func recipe(_ member: VerifiedMember, id: UUID, revision: String) -> Self {
        Self(member: member, key: "recipe/\(id.uuidString.lowercased())/\(revision)") {
            guard MealRevision.valid(revision), $0 == nil || $0?.id == id else {
                throw MealLibraryError.invalidResponse
            }
            return try $0?.validated()
        }
    }
}

extension ChoreOfflineStore {
    static func createReadTables(_ db: SQLiteConnection) throws {
        try createMoneyReadTable(db)
        try createRecipeReadTable(db)
        try createRenewalReadTable(db)
        try createMealWeekReadTable(db)
    }

    static func createRecipeReadTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS recipe_read_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, target TEXT NOT NULL, attempt TEXT NOT NULL, body TEXT, PRIMARY KEY(actor,household,target))"
        )
    }

    func beginRecipeRead<Value>(_ target: RecipeReadTarget<Value>, lease: OfflineLease) throws
        -> RecipeReadTicket<Value>
    {
        try authorize(lease)
        guard target.member.userId == lease.actor, target.member.householdId == lease.household else {
            throw OfflineFailure.sessionChanged
        }
        let ticket = RecipeReadTicket(target: target, attempt: UUID(), lease: lease)
        try db.run(
            "INSERT INTO recipe_read_snapshots(actor,household,target,attempt) VALUES(?,?,?,?) ON CONFLICT(actor,household,target) DO UPDATE SET attempt=excluded.attempt",
            lease.scope + [target.key, ticket.attempt.uuidString.lowercased()])
        return ticket
    }

    func saveRecipeRead<Value>(_ value: Value, ticket: RecipeReadTicket<Value>, savedAt: Date) throws {
        try authorize(ticket.lease)
        guard savedAt.timeIntervalSince1970.isFinite else { throw OfflineFailure.invalidOperation }
        let saved = SavedRecipeRead(
            version: 1, actorId: ticket.lease.actor, householdId: ticket.lease.household,
            value: try ticket.target.validate(value), savedAt: savedAt)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "UPDATE recipe_read_snapshots SET body=? WHERE actor=? AND household=? AND target=? AND attempt=?",
            [body] + ticket.lease.scope + [ticket.target.key, ticket.attempt.uuidString.lowercased()])
    }

    func readRecipeSnapshot<Value>(_ ticket: RecipeReadTicket<Value>) throws -> SavedRecipeRead<Value>? {
        try authorize(ticket.lease)
        let rows = try db.rows(
            "SELECT body FROM recipe_read_snapshots WHERE actor=? AND household=? AND target=?",
            ticket.lease.scope + [ticket.target.key])
        guard let body = rows.first?.first, !body.isEmpty, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecipeRead<Value>.self, from: data)
        guard saved.version == 1, saved.actorId == ticket.lease.actor, saved.householdId == ticket.lease.household,
            saved.savedAt.timeIntervalSince1970.isFinite
        else { throw OfflineFailure.storage }
        return SavedRecipeRead(
            version: 1, actorId: saved.actorId, householdId: saved.householdId,
            value: try ticket.target.validate(saved.value), savedAt: saved.savedAt)
    }

    func forgetRecipeReads(lease: OfflineLease) throws {
        try authorize(lease)
        try db.run("DELETE FROM recipe_read_snapshots WHERE actor=? AND household=?", lease.scope)
    }
}
