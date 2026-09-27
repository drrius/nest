import Foundation

struct SavedGroceryRemove: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let item: GroceryItem
    let command: RemoveGrocery
    let state: State
}

extension ChoreOfflineStore {
    func readGroceryRemove(_ lease: OfflineLease) throws -> SavedGroceryRemove? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,target,item,body,status FROM grocery_removes WHERE actor=? AND household=?",
            lease.scope)
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]), let target = UUID(uuidString: row[1]),
            let itemData = row[2].data(using: .utf8),
            let commandData = row[3].data(using: .utf8),
            let item = try? JSONDecoder().decode(GroceryItem.self, from: itemData).validated(),
            let command = try? JSONDecoder().decode(RemoveGrocery.self, from: commandData)
                .validated(against: item),
            command.operationId == operation, command.itemId == target,
            let state = SavedGroceryRemove.State(rawValue: row[4])
        else { throw OfflineFailure.storage }
        return SavedGroceryRemove(item: item, command: command, state: state)
    }

    func enqueueGroceryRemove(_ item: GroceryItem, command: RemoveGrocery, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try command.validated(against: item)
        guard try readGroceryRemove(lease) == nil,
            try readGroceryEdit(lease)?.item.id != item.id,
            let snapshot = try readGroceries(lease),
            snapshot.snapshot.groceries.contains(item),
            snapshot.items.first(where: { $0.id == item.id })?.state == .open
        else { throw OfflineFailure.missingSnapshot }
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        let captured = String(decoding: try JSONEncoder().encode(item), as: UTF8.self)
        try db.run(
            "INSERT INTO grocery_removes(actor,household,operation,target,item,body,status) VALUES(?,?,?,?,?,?,'pending')",
            lease.scope + [
                command.operationId.uuidString.lowercased(), item.id.uuidString.lowercased(), captured, body,
            ])
    }

    func acknowledgeGroceryRemove(_ receipt: GroceryWriteReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryRemove(lease), saved.state == .pending,
            saved.command.operationId == receipt.operation, saved.item.id == receipt.target,
            saved.item.checked == receipt.checked, receipt.removed,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber),
            let confirmed = Int64(receipt.version), let previous = Int64(saved.item.version),
            confirmed > previous
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_removes SET status='acknowledged',confirmed_version=? WHERE actor=? AND household=?",
            [receipt.version] + lease.scope)
    }

    func conflictGroceryRemove(_ operation: UUID, reason: String, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryRemove(lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_removes SET status='conflict',reason=? WHERE actor=? AND household=?",
            [reason] + lease.scope)
    }

    func discardConflictedGroceryRemove(_ operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryRemove(lease), saved.state == .conflict,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM grocery_removes WHERE actor=? AND household=?", lease.scope)
    }

    func clearConfirmedGroceryRemove(_ snapshot: GroceryList, lease: OfflineLease) throws {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT target FROM grocery_removes WHERE actor=? AND household=? AND status='acknowledged'",
            lease.scope)
        for row in rows {
            guard let target = UUID(uuidString: row[0]) else { throw OfflineFailure.storage }
            guard !snapshot.groceries.contains(where: { $0.id == target }) else { continue }
            try db.run("DELETE FROM grocery_removes WHERE actor=? AND household=?", lease.scope)
        }
    }
}
