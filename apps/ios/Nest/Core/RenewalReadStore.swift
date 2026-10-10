import Foundation

struct RenewalReadTarget<Value: Codable & Sendable>: Sendable {
    let member: VerifiedMember
    fileprivate let key: String
    fileprivate let list: Bool
    fileprivate let first: Bool
    fileprivate let validate: @Sendable (Value) throws -> Value

    private init(
        member: VerifiedMember, key: String, list: Bool, first: Bool,
        validate: @escaping @Sendable (Value) throws -> Value
    ) {
        self.member = member
        self.key = key
        self.list = list
        self.first = first
        self.validate = validate
    }
}

extension RenewalReadTarget where Value == RenewalList {
    static func list(_ member: VerifiedMember, after: UUID?) -> Self {
        Self(
            member: member, key: "list/\(after?.uuidString.lowercased() ?? "first")", list: true, first: after == nil
        ) { try $0.validated(member: member, cursor: after) }
    }
}

extension RenewalReadTarget where Value == CalendarRenewal {
    static func detail(_ member: VerifiedMember, id: UUID) -> Self {
        Self(member: member, key: "detail/\(id.uuidString.lowercased())", list: false, first: false) {
            guard $0.id == id else { throw NestAPIFailure.contract }
            return try $0.validated()
        }
    }
}

struct RenewalReadTicket<Value: Codable & Sendable>: Sendable {
    fileprivate let target: RenewalReadTarget<Value>
    fileprivate let attempt: UUID
    let collectionId: UUID?
    let lease: OfflineLease
}

struct SavedRenewalRead<Value: Codable & Sendable>: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let value: Value
    let savedAt: Date
    let collectionId: UUID?
}

extension ChoreOfflineStore {
    static func createRenewalReadTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS renewal_read_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, target TEXT NOT NULL, attempt TEXT NOT NULL, collection TEXT, body TEXT, PRIMARY KEY(actor,household,target))"
        )
    }

    func beginRenewalRead<Value>(
        _ target: RenewalReadTarget<Value>, lease: OfflineLease, collection expected: UUID? = nil
    ) throws -> RenewalReadTicket<Value> {
        try authorize(lease)
        guard target.member.userId == lease.actor, target.member.householdId == lease.household else {
            throw OfflineFailure.sessionChanged
        }
        let attempt = UUID()
        let collection = target.first ? attempt : target.list ? try renewalListCollection(lease) : nil
        if let expected, expected != collection { throw NestAPIFailure.conflict }
        let ticket = RenewalReadTicket(target: target, attempt: attempt, collectionId: collection, lease: lease)
        try db.run(
            "INSERT INTO renewal_read_snapshots(actor,household,target,attempt) VALUES(?,?,?,?) ON CONFLICT(actor,household,target) DO UPDATE SET attempt=excluded.attempt",
            lease.scope + [target.key, attempt.uuidString.lowercased()])
        return ticket
    }

    func saveRenewalRead<Value>(
        _ value: Value, ticket: RenewalReadTicket<Value>, savedAt: Date
    ) throws -> Bool {
        try authorize(ticket.lease)
        guard savedAt.timeIntervalSince1970.isFinite else { throw OfflineFailure.invalidOperation }
        let saved = SavedRenewalRead(
            version: 1, actorId: ticket.lease.actor, householdId: ticket.lease.household,
            value: try ticket.target.validate(value), savedAt: savedAt, collectionId: ticket.collectionId)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        return try db.transaction {
            guard try renewalReadIsCurrent(ticket) else { return false }
            if ticket.target.first {
                try db.run(
                    "DELETE FROM renewal_read_snapshots WHERE actor=? AND household=? AND target LIKE 'list/%' AND target!='list/first'",
                    ticket.lease.scope)
            }
            try db.run(
                "UPDATE renewal_read_snapshots SET body=?,collection=? WHERE actor=? AND household=? AND target=? AND attempt=?",
                [body, ticket.collectionId?.uuidString.lowercased() ?? ""] + ticket.lease.scope
                    + [ticket.target.key, ticket.attempt.uuidString.lowercased()])
            return true
        }
    }

    private func renewalReadIsCurrent<Value>(_ ticket: RenewalReadTicket<Value>) throws -> Bool {
        let attempt = try db.rows(
            "SELECT attempt FROM renewal_read_snapshots WHERE actor=? AND household=? AND target=?",
            ticket.lease.scope + [ticket.target.key])
        guard attempt.first?.first == ticket.attempt.uuidString.lowercased() else { return false }
        guard ticket.target.list && !ticket.target.first else { return true }
        let current = try renewalListCollection(ticket.lease)
        return ticket.collectionId != nil && ticket.collectionId == current
    }

    func readRenewalSnapshot<Value>(_ ticket: RenewalReadTicket<Value>) throws -> SavedRenewalRead<Value>? {
        try authorize(ticket.lease)
        let rows = try db.rows(
            "SELECT body,collection FROM renewal_read_snapshots WHERE actor=? AND household=? AND target=?",
            ticket.lease.scope + [ticket.target.key])
        guard let row = rows.first, !row[0].isEmpty, let data = row[0].data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRenewalRead<Value>.self, from: data)
        guard saved.version == 1, saved.actorId == ticket.lease.actor, saved.householdId == ticket.lease.household,
            saved.savedAt.timeIntervalSince1970.isFinite,
            (saved.collectionId?.uuidString.lowercased() ?? "") == row[1],
            ticket.target.list == (saved.collectionId != nil)
        else { throw OfflineFailure.storage }
        if ticket.target.list && !ticket.target.first {
            guard saved.collectionId == ticket.collectionId,
                saved.collectionId == (try renewalListCollection(ticket.lease))
            else { return nil }
        }
        return SavedRenewalRead(
            version: 1, actorId: saved.actorId, householdId: saved.householdId,
            value: try ticket.target.validate(saved.value), savedAt: saved.savedAt, collectionId: saved.collectionId)
    }

    private func renewalListCollection(_ lease: OfflineLease) throws -> UUID? {
        let rows = try db.rows(
            "SELECT collection FROM renewal_read_snapshots WHERE actor=? AND household=? AND target='list/first' AND body IS NOT NULL",
            lease.scope)
        return rows.first?.first.flatMap(UUID.init(uuidString:))
    }

    func applyConfirmedRenewalRead(_ receipt: RenewalReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt.validated(member: member, expected: receipt.command)
        let saved = SavedRenewalRead(
            version: 1, actorId: lease.actor, householdId: lease.household, value: receipt.renewal,
            savedAt: Date(), collectionId: nil)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "DELETE FROM renewal_read_snapshots WHERE actor=? AND household=? AND target LIKE 'list/%'", lease.scope)
        try db.run(
            "INSERT INTO renewal_read_snapshots(actor,household,target,attempt,collection,body) VALUES(?,?,?,?,?,?) ON CONFLICT(actor,household,target) DO UPDATE SET attempt=excluded.attempt,collection=excluded.collection,body=excluded.body",
            lease.scope + [
                "detail/\(receipt.renewal.id.uuidString.lowercased())", UUID().uuidString.lowercased(), "", body,
            ])
    }

    func forgetRenewalReads(lease: OfflineLease) throws {
        try authorize(lease)
        try db.run("DELETE FROM renewal_read_snapshots WHERE actor=? AND household=?", lease.scope)
    }
}
