import Foundation

/// Read-only snapshots never supply financial command preflights or receipt URLs.
struct MoneyReadTarget<Value: Codable & Sendable>: Sendable {
    let member: VerifiedMember
    fileprivate let key: String
    fileprivate let validate: @Sendable (Value) throws -> Value

    private init(member: VerifiedMember, key: String, validate: @escaping @Sendable (Value) throws -> Value) {
        self.member = member
        self.key = key
        self.validate = validate
    }
}

extension MoneyReadTarget where Value == MoneyBalance {
    static func balance(_ member: VerifiedMember) -> Self {
        Self(member: member, key: "balance") { try $0.validated(member: member) }
    }
}

extension MoneyReadTarget where Value == MoneyHistory {
    static func history(_ member: VerifiedMember, before: UUID?) -> Self {
        Self(member: member, key: "history/\(before?.uuidString.lowercased() ?? "first")") {
            try $0.validated(member: member, cursor: before)
        }
    }
}

extension MoneyReadTarget where Value == MoneyDetail {
    static func detail(_ member: VerifiedMember, eventId: UUID) -> Self {
        Self(member: member, key: "detail/\(eventId.uuidString.lowercased())") {
            try $0.validated(member: member, eventId: eventId)
        }
    }
}

struct MoneyReadTicket<Value: Codable & Sendable>: Sendable {
    fileprivate let target: MoneyReadTarget<Value>
    fileprivate let attempt: UUID
    let lease: OfflineLease
}

struct SavedMoneyRead<Value: Codable & Sendable>: Codable, Sendable {
    let value: Value
    let savedAt: Date
}

extension ChoreOfflineStore {
    static func createMoneyReadTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS money_read_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, target TEXT NOT NULL, attempt TEXT NOT NULL, body TEXT, PRIMARY KEY(actor,household,target))"
        )
    }

    func beginMoneyRead<Value>(_ target: MoneyReadTarget<Value>, lease: OfflineLease) throws -> MoneyReadTicket<Value> {
        try authorize(lease)
        guard target.member.userId == lease.actor, target.member.householdId == lease.household else {
            throw OfflineFailure.sessionChanged
        }
        let ticket = MoneyReadTicket(target: target, attempt: UUID(), lease: lease)
        try db.run(
            "INSERT INTO money_read_snapshots(actor,household,target,attempt) VALUES(?,?,?,?) ON CONFLICT(actor,household,target) DO UPDATE SET attempt=excluded.attempt",
            lease.scope + [target.key, ticket.attempt.uuidString.lowercased()])
        return ticket
    }

    func saveMoneyRead<Value>(_ value: Value, ticket: MoneyReadTicket<Value>, savedAt: Date) throws {
        try authorize(ticket.lease)
        guard savedAt.timeIntervalSince1970.isFinite else { throw OfflineFailure.invalidOperation }
        let saved = SavedMoneyRead(value: try ticket.target.validate(value), savedAt: savedAt)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "UPDATE money_read_snapshots SET body=? WHERE actor=? AND household=? AND target=? AND attempt=?",
            [body] + ticket.lease.scope + [ticket.target.key, ticket.attempt.uuidString.lowercased()])
    }

    func readMoneySnapshot<Value>(_ ticket: MoneyReadTicket<Value>) throws -> SavedMoneyRead<Value>? {
        try authorize(ticket.lease)
        let rows = try db.rows(
            "SELECT body FROM money_read_snapshots WHERE actor=? AND household=? AND target=?",
            ticket.lease.scope + [ticket.target.key])
        guard let body = rows.first?.first, !body.isEmpty, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedMoneyRead<Value>.self, from: data)
        guard saved.savedAt.timeIntervalSince1970.isFinite else { throw OfflineFailure.storage }
        return SavedMoneyRead(value: try ticket.target.validate(saved.value), savedAt: saved.savedAt)
    }

    func forgetMoneyReads(lease: OfflineLease) throws {
        try authorize(lease)
        try db.run("DELETE FROM money_read_snapshots WHERE actor=? AND household=?", lease.scope)
    }

    func persistedMoneyLease(actor: UUID) throws -> OfflineLease? {
        let rows = try db.rows(
            "SELECT household,lease FROM offline_scope WHERE id=1 AND actor=?", [actor.uuidString.lowercased()])
        guard let row = rows.first, let household = UUID(uuidString: row[0]), let value = UUID(uuidString: row[1])
        else {
            return nil
        }
        return OfflineLease(actor: actor, household: household, value: value)
    }

    func revokeMoneyMembership(lease: OfflineLease) throws {
        try authorize(lease)
        try db.transaction {
            try db.run("DELETE FROM money_read_snapshots WHERE actor=? AND household=?", lease.scope)
            try db.run("DELETE FROM recipe_read_snapshots WHERE actor=? AND household=?", lease.scope)
            try forgetRenewalReads(lease: lease)
            try db.run(
                "DELETE FROM offline_scope WHERE id=1 AND actor=? AND household=? AND lease=?",
                lease.scope + [lease.value.uuidString.lowercased()])
        }
    }
}
