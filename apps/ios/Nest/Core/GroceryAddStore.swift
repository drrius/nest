import Foundation

struct SavedGroceryAdd: Equatable, Sendable {
    enum State: String, Sendable { case pending, acknowledged, conflict }
    let command: AddGrocery
    let state: State
}

extension ChoreOfflineStore {
    func readGroceryAdd(_ lease: OfflineLease) throws -> SavedGroceryAdd? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT operation,target,body,status FROM grocery_adds WHERE actor=? AND household=?",
            lease.scope)
        guard let row = rows.first else { return nil }
        guard let operation = UUID(uuidString: row[0]), let target = UUID(uuidString: row[1]),
            let data = row[2].data(using: .utf8),
            let command = try? JSONDecoder().decode(AddGrocery.self, from: data).validated(),
            command.operationId == operation, command.itemId == target,
            let state = SavedGroceryAdd.State(rawValue: row[3])
        else { throw OfflineFailure.storage }
        return SavedGroceryAdd(command: command, state: state)
    }

    func enqueueGroceryAdd(_ command: AddGrocery, lease: OfflineLease) throws {
        try authorize(lease)
        _ = try command.validated()
        guard try readGroceryAdd(lease) == nil else { throw OfflineFailure.alreadyQueued }
        let body = String(decoding: try JSONEncoder().encode(command), as: UTF8.self)
        try db.run(
            "INSERT INTO grocery_adds(actor,household,operation,target,body,status) VALUES(?,?,?,?,?,'pending')",
            lease.scope + [command.operationId.uuidString.lowercased(), command.itemId.uuidString.lowercased(), body])
    }

    func acknowledgeGroceryAdd(_ receipt: GroceryWriteReceipt, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryAdd(lease), saved.state == .pending,
            saved.command.operationId == receipt.operation,
            saved.command.itemId == receipt.target, !receipt.checked, !receipt.removed,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber), Int64(receipt.version) != nil
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_adds SET status='acknowledged',confirmed_version=? WHERE actor=? AND household=?",
            [receipt.version] + lease.scope)
    }

    func conflictGroceryAdd(_ operation: UUID, reason: String, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryAdd(lease), saved.state == .pending,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run(
            "UPDATE grocery_adds SET status='conflict',reason=? WHERE actor=? AND household=?",
            [reason] + lease.scope)
    }

    func discardConflictedGroceryAdd(_ operation: UUID, lease: OfflineLease) throws {
        try authorize(lease)
        guard let saved = try readGroceryAdd(lease), saved.state == .conflict,
            saved.command.operationId == operation
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM grocery_adds WHERE actor=? AND household=?", lease.scope)
    }

    func clearConfirmedGroceryAdd(_ lease: OfflineLease) throws {
        try authorize(lease)
        try db.run(
            "DELETE FROM grocery_adds WHERE actor=? AND household=? AND status='acknowledged'",
            lease.scope)
    }
}
