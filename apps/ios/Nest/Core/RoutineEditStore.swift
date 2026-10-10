import Foundation

struct SavedRoutineEdit: Codable, Equatable, Sendable {
    let command: EditRoutine
    let title: String
    var receipt: RoutineCreateReceipt?
    var conflicted: Bool

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated()
        guard !title.isEmpty, title.unicodeScalars.count <= 120, !title.contains("\0"),
            !conflicted || receipt == nil
        else { throw OfflineFailure.storage }
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}

extension ChoreOfflineStore {
    func readRoutineEdit(lease: OfflineLease) throws -> SavedRoutineEdit? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM routine_edits WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRoutineEdit.self, from: data).validated(lease)
    }

    func enqueueRoutineEdit(_ command: EditRoutine, title: String, lease: OfflineLease) throws {
        guard try readRoutineEdit(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedRoutineEdit(command: command, title: title, receipt: nil, conflicted: false).validated(
            lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO routine_edits(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRoutineEdit(_ receipt: RoutineCreateReceipt, lease: OfflineLease) throws {
        guard var saved = try readRoutineEdit(lease: lease), !saved.conflicted else {
            throw OfflineFailure.invalidOperation
        }
        if let previous = saved.receipt {
            guard previous == receipt else { throw OfflineFailure.invalidOperation }
            return
        }
        saved.receipt = receipt
        try writeRoutineEdit(saved, lease: lease)
    }

    func conflictRoutineEdit(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readRoutineEdit(lease: lease), saved.command.operationId == operation,
            saved.receipt == nil
        else { throw OfflineFailure.invalidOperation }
        saved.conflicted = true
        try writeRoutineEdit(saved, lease: lease)
    }

    func finishRoutineEdit(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRoutineEdit(lease: lease), saved.command.operationId == operation,
            saved.receipt != nil || saved.conflicted
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM routine_edits WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRoutineEdit(_ saved: SavedRoutineEdit, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE routine_edits SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
