import Foundation

struct LocalGrocery: Identifiable, Equatable, Sendable {
    enum State: String, Sendable { case open, pending, acknowledged, conflict }
    let item: GroceryItem
    let state: State
    let operationId: UUID?
    let requestedChecked: Bool?
    var id: UUID { item.id }
    var checked: Bool { state == .pending || state == .acknowledged ? requestedChecked ?? item.checked : item.checked }
}

struct GroceryOfflineState: Equatable, Sendable {
    let snapshot: GroceryList
    let items: [LocalGrocery]
}

private struct SavedGroceryCheck {
    let item: GroceryItem
    let command: CheckGrocery
    let state: LocalGrocery.State
}

extension ChoreOfflineStore {
    func readGroceries(_ lease: OfflineLease) throws -> GroceryOfflineState? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM grocery_snapshots WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let snapshot = try JSONDecoder().decode(GroceryList.self, from: data)
            .validated(household: lease.household)
        let operations = try savedGroceryChecks(lease)
        let items = snapshot.groceries.map { item in
            let saved = operations[item.id]
            return LocalGrocery(
                item: item, state: saved?.state ?? .open,
                operationId: saved?.command.operationId,
                requestedChecked: saved?.command.checked)
        }
        let current = Set(snapshot.groceries.map(\.id))
        let missing = operations.filter { !current.contains($0.key) && $0.value.state != .acknowledged }
            .map { saved in
                LocalGrocery(
                    item: saved.value.item, state: saved.value.state,
                    operationId: saved.value.command.operationId,
                    requestedChecked: saved.value.command.checked)
            }
            .sorted { $0.item.name < $1.item.name }
        return GroceryOfflineState(snapshot: snapshot, items: items + missing)
    }

    func saveGroceries(_ snapshot: GroceryList, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try snapshot.validated(household: lease.household)
        let body = String(decoding: try JSONEncoder().encode(snapshot), as: UTF8.self)
        try db.transaction {
            try db.run(
                "INSERT INTO grocery_snapshots(actor,household,body) VALUES(?,?,?) ON CONFLICT(actor,household) DO UPDATE SET body=excluded.body",
                lease.scope + [body])
            try clearObservedGroceryChecks(snapshot, lease: lease)
        }
    }

    func enqueueGroceryCheck(
        _ item: GroceryItem, checked: Bool, operation: UUID, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard item.offlineEpoch != nil, checked != item.checked,
            let snapshot = try readGroceries(lease), snapshot.snapshot.groceries.contains(item)
        else { throw OfflineFailure.missingSnapshot }
        let active = try db.rows(
            "SELECT operation FROM grocery_checks WHERE actor=? AND household=? AND target=?",
            lease.scope + [item.id.uuidString.lowercased()])
        guard active.isEmpty else { throw OfflineFailure.alreadyQueued }
        let count = try db.rows(
            "SELECT COUNT(*) FROM grocery_checks WHERE actor=? AND household=? AND status!='acknowledged'",
            lease.scope)
        guard Int(count[0][0]) ?? 0 < 1_000 else { throw OfflineFailure.queueFull }
        let command = CheckGrocery(item: item, operationId: operation, checked: checked)
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        let captured = String(decoding: try JSONEncoder().encode(item), as: UTF8.self)
        try db.run(
            "INSERT INTO grocery_checks(actor,household,operation,target,item,body,status) VALUES(?,?,?,?,?,?,'pending')",
            lease.scope + [operation.uuidString.lowercased(), item.id.uuidString.lowercased(), captured, body])
    }

    func nextGroceryCheck(_ lease: OfflineLease) throws -> CheckGrocery? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM grocery_checks WHERE actor=? AND household=? AND status='pending' ORDER BY sequence LIMIT 1",
            lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(CheckGrocery.self, from: data)
    }

    func acknowledgeGroceryCheck(_ receipt: GroceryCheckReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        let id = receipt.operation.uuidString.lowercased()
        let rows = try db.rows(
            "SELECT body,status FROM grocery_checks WHERE actor=? AND household=? AND operation=?",
            lease.scope + [id])
        guard let row = rows.first, row[1] == "pending", let data = row[0].data(using: .utf8),
            let command = try? JSONDecoder().decode(CheckGrocery.self, from: data),
            receipt.target == command.itemId, receipt.checked == command.checked,
            Int64(receipt.version) != nil
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_checks SET status='acknowledged',confirmed_version=? WHERE actor=? AND household=? AND operation=?",
            [receipt.version] + lease.scope + [id])
    }

    func conflictGroceryCheck(_ operation: UUID, reason: String, lease: OfflineLease) throws {
        try authorize(lease)
        let id = operation.uuidString.lowercased()
        let rows = try db.rows(
            "SELECT status FROM grocery_checks WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
        guard rows.first?.first == "pending" else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_checks SET status='conflict',reason=? WHERE actor=? AND household=? AND operation=?",
            [reason] + lease.scope + [id])
    }

    func discardGroceryCheck(_ operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        let id = operation.uuidString.lowercased()
        let rows = try db.rows(
            "SELECT status FROM grocery_checks WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
        guard rows.first?.first == "conflict" else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM grocery_checks WHERE actor=? AND household=? AND operation=?", lease.scope + [id])
    }

    private func savedGroceryChecks(_ lease: OfflineLease) throws -> [UUID: SavedGroceryCheck] {
        let rows = try db.rows(
            "SELECT target,status,operation,item,body FROM grocery_checks WHERE actor=? AND household=? ORDER BY sequence",
            lease.scope)
        var saved: [UUID: SavedGroceryCheck] = [:]
        for row in rows {
            guard let target = UUID(uuidString: row[0]),
                let operation = UUID(uuidString: row[2]),
                let itemData = row[3].data(using: .utf8),
                let commandData = row[4].data(using: .utf8),
                let item = try? JSONDecoder().decode(GroceryItem.self, from: itemData).validated(),
                let command = try? JSONDecoder().decode(CheckGrocery.self, from: commandData),
                command.itemId == target, command.operationId == operation,
                command.expectedVersion == item.version, command.offlineEpoch == item.offlineEpoch,
                let state = LocalGrocery.State(rawValue: row[1]), saved[target] == nil
            else { throw OfflineFailure.storage }
            saved[target] = SavedGroceryCheck(item: item, command: command, state: state)
        }
        return saved
    }

    private func clearObservedGroceryChecks(_ snapshot: GroceryList, lease: OfflineLease) throws {
        let rows = try db.rows(
            "SELECT operation,target,confirmed_version,body FROM grocery_checks WHERE actor=? AND household=? AND status='acknowledged'",
            lease.scope)
        let current = Dictionary(uniqueKeysWithValues: snapshot.groceries.map { ($0.id, $0) })
        for row in rows {
            guard let target = UUID(uuidString: row[1]), let confirmed = Int64(row[2]),
                let data = row[3].data(using: .utf8),
                let command = try? JSONDecoder().decode(CheckGrocery.self, from: data)
            else { throw OfflineFailure.storage }
            if let remote = current[target], let version = Int64(remote.version),
                version < confirmed || (version == confirmed && remote.checked != command.checked)
            {
                continue
            }
            try db.run(
                "DELETE FROM grocery_checks WHERE actor=? AND household=? AND operation=?",
                lease.scope + [row[0]])
        }
    }
}
