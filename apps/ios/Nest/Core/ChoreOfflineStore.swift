import Foundation

struct OfflineLease: Equatable, Sendable {
    let actor: UUID
    let household: UUID
    let value: UUID

    var scope: [String] { [actor.uuidString.lowercased(), household.uuidString.lowercased()] }
}

struct LocalChore: Identifiable, Equatable, Sendable {
    enum State: String, Sendable { case open, pending, completed, conflict }
    let chore: NestChore
    let state: State
    let operationId: UUID?
    var id: UUID { chore.id }
}

struct ChoreOfflineState: Equatable, Sendable {
    let snapshot: ChoreSnapshot
    let chores: [LocalChore]
}

actor ChoreOfflineStore {
    let db: SQLiteConnection

    init(url: URL) throws {
        db = try SQLiteConnection(url: url)
        try db.run(
            "CREATE TABLE IF NOT EXISTS offline_scope (id INTEGER PRIMARY KEY CHECK(id=1), actor TEXT NOT NULL, household TEXT NOT NULL, lease TEXT NOT NULL)"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS chore_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor, household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS chore_operations (sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, target TEXT NOT NULL, chore TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), reason TEXT)"
        )
        try db.run("CREATE INDEX IF NOT EXISTS chore_operations_scope ON chore_operations(actor, household, sequence)")
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_snapshots (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor, household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_checks (sequence INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, target TEXT NOT NULL, item TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_version TEXT, reason TEXT, UNIQUE(actor,household,target))"
        )
        try db.run("CREATE INDEX IF NOT EXISTS grocery_checks_scope ON grocery_checks(actor, household, sequence)")
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_adds (actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, target TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_version TEXT, reason TEXT, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_edits (actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, target TEXT NOT NULL, item TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_version TEXT, reason TEXT, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS grocery_removes (actor TEXT NOT NULL, household TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, target TEXT NOT NULL, item TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_version TEXT, reason TEXT, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_weeks (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household,week_start))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_placements (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, week TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_revision TEXT, entry_id TEXT, reason TEXT, PRIMARY KEY(actor,household,week_start))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_removals (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, week TEXT NOT NULL, meal TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_revision TEXT, reason TEXT, PRIMARY KEY(actor,household,week_start))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_recipe_placements (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, operation TEXT NOT NULL UNIQUE, week TEXT NOT NULL, recipe TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','acknowledged','conflict')), confirmed_revision TEXT, entry_id TEXT, reason TEXT, PRIMARY KEY(actor,household,week_start))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS planned_recipes (actor TEXT NOT NULL, household TEXT NOT NULL, week_start TEXT NOT NULL, entry_id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household,week_start,entry_id))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_replacements (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS cooking_profiles (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS cooking_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS recipe_edits (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS recipe_archives (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS recipe_creations (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_leftovers (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS meal_moves (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    static func application(environment: URL) throws -> ChoreOfflineStore {
        let scope = try NestEnvironmentScope(url: environment)
        let directory = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        )
        let url = directory.appending(path: "nest-offline-\(scope.fingerprint).sqlite")
        #if os(iOS)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete], ofItemAtPath: directory.path)
            if FileManager.default.fileExists(atPath: url.path) {
                try FileManager.default.setAttributes(
                    [.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
            }
        #endif
        let store = try ChoreOfflineStore(url: url)
        #if os(iOS)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: url.path)
        #endif
        return store
    }

    func activate(_ member: VerifiedMember) throws -> OfflineLease {
        let lease = OfflineLease(actor: member.userId, household: member.householdId, value: UUID())
        try db.run(
            "INSERT INTO offline_scope(id,actor,household,lease) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET actor=excluded.actor,household=excluded.household,lease=excluded.lease",
            lease.scope + [lease.value.uuidString.lowercased()])
        return lease
    }

    func cachedMember(actor: UUID) throws -> VerifiedMember? {
        let actorID = actor.uuidString.lowercased()
        let rows = try db.rows("SELECT household FROM offline_scope WHERE id=1 AND actor=?", [actorID])
        guard let value = rows.first?.first, let household = UUID(uuidString: value) else { return nil }
        let scope = [actorID, household.uuidString.lowercased()]
        let saved = try db.rows("SELECT body FROM chore_snapshots WHERE actor=? AND household=?", scope)
        guard let body = saved.first?.first, let data = body.data(using: .utf8) else { return nil }
        let snapshot = try JSONDecoder().decode(ChoreSnapshot.self, from: data)
            .validated(household: household, actor: actor)
        guard let name = snapshot.members.first(where: { $0.actorId == actor })?.displayName else {
            return nil
        }
        return VerifiedMember(userId: actor, householdId: household, displayName: name)
    }

    func deactivate(_ lease: OfflineLease) throws {
        try authorize(lease)
        try db.run("DELETE FROM offline_scope WHERE id=1")
    }

    func read(_ lease: OfflineLease) throws -> ChoreOfflineState? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM chore_snapshots WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let snapshot = try JSONDecoder().decode(ChoreSnapshot.self, from: data)
            .validated(household: lease.household, actor: lease.actor)
        let operations = try db.rows(
            "SELECT target,status,operation,chore FROM chore_operations WHERE actor=? AND household=? ORDER BY sequence",
            lease.scope)
        var states: [UUID: (LocalChore.State, UUID, NestChore)] = [:]
        for row in operations {
            guard let target = UUID(uuidString: row[0]),
                let operation = UUID(uuidString: row[2]),
                let data = row[3].data(using: .utf8),
                let chore = try? JSONDecoder().decode(NestChore.self, from: data)
            else { throw OfflineFailure.storage }
            let state: LocalChore.State =
                switch row[1] {
                case "pending": .pending
                case "acknowledged": .completed
                case "conflict": .conflict
                default: throw OfflineFailure.storage
                }
            states[target] = (state, operation, chore)
        }
        let current = snapshot.chores.map {
            LocalChore(
                chore: $0, state: states[$0.id]?.0 ?? .open,
                operationId: states[$0.id]?.1)
        }
        let currentIDs = Set(snapshot.chores.map(\.id))
        let removed = states.filter { !currentIDs.contains($0.key) && $0.value.0 != .completed }
            .map { LocalChore(chore: $0.value.2, state: $0.value.0, operationId: $0.value.1) }
            .sorted { $0.chore.dueDate.value < $1.chore.dueDate.value }
        return ChoreOfflineState(snapshot: snapshot, chores: current + removed)
    }

    func save(_ snapshot: ChoreSnapshot, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try snapshot.validated(household: lease.household, actor: lease.actor)
        let body = String(decoding: try JSONEncoder().encode(snapshot), as: UTF8.self)
        try db.transaction {
            try db.run(
                "INSERT INTO chore_snapshots(actor,household,body) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET body=excluded.body",
                lease.scope + [body])
            let acknowledged = try db.rows(
                "SELECT operation,target FROM chore_operations WHERE actor=? AND household=? AND status='acknowledged'",
                lease.scope)
            let currentIDs = Set(snapshot.chores.map(\.id))
            for row in acknowledged {
                guard let target = UUID(uuidString: row[1]) else { throw OfflineFailure.storage }
                if !currentIDs.contains(target) {
                    try db.run(
                        "DELETE FROM chore_operations WHERE actor=? AND household=? AND operation=?",
                        lease.scope + [row[0]])
                }
            }
        }
    }

    func enqueue(_ chore: NestChore, on date: CivilDate, operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        guard chore.offlineEpoch != nil else { throw OfflineFailure.missingSnapshot }
        let active = try db.rows(
            "SELECT operation FROM chore_operations WHERE actor=? AND household=? AND target=?",
            lease.scope + [chore.id.uuidString.lowercased()])
        guard active.isEmpty else { throw OfflineFailure.alreadyQueued }
        guard let snapshot = try read(lease), snapshot.snapshot.chores.contains(chore) else {
            throw OfflineFailure.missingSnapshot
        }
        let count = try db.rows(
            "SELECT COUNT(*) FROM chore_operations WHERE actor=? AND household=? AND status!='acknowledged'",
            lease.scope)
        guard Int(count[0][0]) ?? 0 < 1_000 else { throw OfflineFailure.queueFull }
        let command = CompleteChore(chore: chore, operationId: operation, completedOn: date)
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        let captured = String(decoding: try JSONEncoder().encode(chore), as: UTF8.self)
        try db.run(
            "INSERT INTO chore_operations(actor,household,operation,target,chore,body,status) VALUES(?,?,?,?,?,?,'pending')",
            lease.scope + [operation.uuidString.lowercased(), chore.id.uuidString.lowercased(), captured, body])
    }

    func next(_ lease: OfflineLease) throws -> CompleteChore? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM chore_operations WHERE actor=? AND household=? AND status='pending' ORDER BY sequence LIMIT 1",
            lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(CompleteChore.self, from: data)
    }

    func acknowledge(_ receipt: ChoreCompletion, lease: OfflineLease) throws {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body,status FROM chore_operations WHERE actor=? AND household=? AND operation=?",
            lease.scope + [receipt.operationId.uuidString.lowercased()])
        guard let row = rows.first, row[1] == "pending", let data = row[0].data(using: .utf8),
            let command = try? JSONDecoder().decode(CompleteChore.self, from: data),
            receipt.version == 1, receipt.occurrenceId == command.occurrenceId
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE chore_operations SET status='acknowledged' WHERE actor=? AND household=? AND operation=?",
            lease.scope + [receipt.operationId.uuidString.lowercased()])
    }

    func conflict(_ operation: UUID, reason: String, lease: OfflineLease) throws {
        try authorize(lease)
        let id = operation.uuidString.lowercased()
        let rows = try db.rows(
            "SELECT status FROM chore_operations WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
        guard rows.first?.first == "pending" else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE chore_operations SET status='conflict',reason=? WHERE actor=? AND household=? AND operation=?",
            [reason] + lease.scope + [id])
    }

    func discard(_ operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        let id = operation.uuidString.lowercased()
        let rows = try db.rows(
            "SELECT status FROM chore_operations WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
        guard rows.first?.first == "conflict" else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM chore_operations WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
    }

    func authorize(_ lease: OfflineLease) throws {
        let rows = try db.rows("SELECT lease FROM offline_scope WHERE id=1 AND actor=? AND household=?", lease.scope)
        guard rows.first?.first == lease.value.uuidString.lowercased() else {
            throw OfflineFailure.sessionChanged
        }
    }
}
