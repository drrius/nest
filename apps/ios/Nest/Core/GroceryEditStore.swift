import Foundation

struct SavedGroceryEdit: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let item: GroceryItem
    let command: EditGrocery
    let state: State
}

extension ChoreOfflineStore {
    func readGroceryEdit(_ lease: OfflineLease) throws -> SavedGroceryEdit? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,target,item,body,status FROM grocery_edits WHERE actor=? AND household=?",
            lease.scope)
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]), let target = UUID(uuidString: row[1]),
            let itemData = row[2].data(using: .utf8),
            let commandData = row[3].data(using: .utf8),
            let item = try? JSONDecoder().decode(GroceryItem.self, from: itemData).validated(),
            let command = try? JSONDecoder().decode(EditGrocery.self, from: commandData)
                .validated(against: item),
            command.operationId == operation, command.itemId == target,
            let state = SavedGroceryEdit.State(rawValue: row[4])
        else { throw OfflineFailure.storage }
        return SavedGroceryEdit(item: item, command: command, state: state)
    }

    func enqueueGroceryEdit(_ item: GroceryItem, command: EditGrocery, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try command.validated(against: item)
        guard try readGroceryEdit(lease) == nil else { throw OfflineFailure.alreadyQueued }
        guard let snapshot = try readGroceries(lease),
            snapshot.snapshot.groceries.contains(item),
            snapshot.items.first(where: { $0.id == item.id })?.state == .open
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        let captured = String(decoding: try JSONEncoder().encode(item), as: UTF8.self)
        try db.run(
            "INSERT INTO grocery_edits(actor,household,operation,target,item,body,status) VALUES(?,?,?,?,?,?,'pending')",
            lease.scope + [
                command.operationId.uuidString.lowercased(), item.id.uuidString.lowercased(), captured, body,
            ])
    }

    func acknowledgeGroceryEdit(_ receipt: GroceryWriteReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryEdit(lease), saved.state == .pending,
            saved.command.operationId == receipt.operation, saved.item.id == receipt.target,
            saved.item.checked == receipt.checked, !receipt.removed,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber),
            let confirmed = Int64(receipt.version), let previous = Int64(saved.item.version),
            confirmed > previous
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_edits SET status='acknowledged',confirmed_version=? WHERE actor=? AND household=?",
            [receipt.version] + lease.scope)
    }

    func conflictGroceryEdit(_ operation: UUID, reason: String, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryEdit(lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_edits SET status='conflict',reason=? WHERE actor=? AND household=?",
            [reason] + lease.scope)
    }

    func discardConflictedGroceryEdit(_ operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryEdit(lease), saved.state == .conflict,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM grocery_edits WHERE actor=? AND household=?", lease.scope)
    }

    func clearConfirmedGroceryEdit(_ snapshot: GroceryList, lease: OfflineLease) throws {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT target,confirmed_version,body FROM grocery_edits WHERE actor=? AND household=? AND status='acknowledged'",
            lease.scope)
        let current = Dictionary(uniqueKeysWithValues: snapshot.groceries.map { ($0.id, $0) })
        for row in rows {
            guard let target = UUID(uuidString: row[0]), let confirmed = Int64(row[1]),
                let data = row[2].data(using: .utf8),
                let command = try? JSONDecoder().decode(EditGrocery.self, from: data)
            else { throw OfflineFailure.storage }
            if let remote = current[target], !observesGroceryEdit(remote, version: confirmed, command: command) {
                continue
            }
            try db.run("DELETE FROM grocery_edits WHERE actor=? AND household=?", lease.scope)
        }
    }

    private func observesGroceryEdit(
        _ remote: GroceryItem, version confirmed: Int64, command: EditGrocery
    ) -> Bool {
        guard let version = Int64(remote.version), version >= confirmed else { return false }
        return version > confirmed
            || remote.name == command.name
                && remote.quantity == command.quantity && remote.unit == command.unit
                && remote.categoryId == command.categoryId
    }
}
