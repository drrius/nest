import Foundation

struct SavedChoreTransfer: Codable, Equatable, Sendable {
    let command: SavedTransferCommand
    let title: String
    var receipt: ChoreTransferReceipt?
    var conflicted: Bool

    func validated(_ lease: OfflineLease) throws -> Self {
        try command.validate(actor: lease.actor)
        guard !title.isEmpty, title.unicodeScalars.count <= 120, !title.contains("\0"),
            !conflicted || receipt == nil
        else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        try receipt.map { try command.validate(receipt: $0, member: member) }
        return self
    }
}

extension ChoreOfflineStore {
    func readChoreTransfer(lease: OfflineLease) throws -> SavedChoreTransfer? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM chore_transfers WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedChoreTransfer.self, from: data).validated(lease)
    }

    func enqueueChoreTransfer(_ command: SavedTransferCommand, title: String, lease: OfflineLease) throws {
        guard try readChoreTransfer(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedChoreTransfer(command: command, title: title, receipt: nil, conflicted: false).validated(
            lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO chore_transfers(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeChoreTransfer(_ receipt: ChoreTransferReceipt, lease: OfflineLease) throws {
        guard var saved = try readChoreTransfer(lease: lease), !saved.conflicted else {
            throw OfflineFailure.invalidOperation
        }
        if let previous = saved.receipt {
            guard previous == receipt else { throw OfflineFailure.invalidOperation }
            return
        }
        saved.receipt = receipt
        try writeChoreTransfer(saved, lease: lease)
    }

    func conflictChoreTransfer(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readChoreTransfer(lease: lease), saved.command.operationId == operation,
            saved.receipt == nil
        else { throw OfflineFailure.invalidOperation }
        saved.conflicted = true
        try writeChoreTransfer(saved, lease: lease)
    }

    func finishChoreTransfer(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readChoreTransfer(lease: lease), saved.command.operationId == operation,
            saved.receipt != nil || saved.conflicted
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM chore_transfers WHERE actor=? AND household=?", lease.scope)
    }

    private func writeChoreTransfer(_ saved: SavedChoreTransfer, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE chore_transfers SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
