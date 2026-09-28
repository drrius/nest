import Foundation

struct SavedRoutineState: Codable, Equatable, Sendable {
    let command: RoutineStateCommand
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
    func readRoutineState(lease: OfflineLease) throws -> SavedRoutineState? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM routine_state_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRoutineState.self, from: data).validated(lease)
    }

    func enqueueRoutineState(_ command: RoutineStateCommand, title: String, lease: OfflineLease) throws {
        guard try readRoutineState(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedRoutineState(command: command, title: title, receipt: nil, conflicted: false).validated(
            lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO routine_state_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRoutineState(_ receipt: RoutineCreateReceipt, lease: OfflineLease) throws {
        guard var saved = try readRoutineState(lease: lease), !saved.conflicted else {
            throw OfflineFailure.invalidOperation
        }
        if let previous = saved.receipt {
            guard previous == receipt else { throw OfflineFailure.invalidOperation }
            return
        }
        saved.receipt = receipt
        try writeRoutineState(saved, lease: lease)
    }

    func conflictRoutineState(operation: UUID, lease: OfflineLease) throws {
        guard var saved = try readRoutineState(lease: lease), saved.command.operationId == operation,
            saved.receipt == nil
        else { throw OfflineFailure.invalidOperation }
        saved.conflicted = true
        try writeRoutineState(saved, lease: lease)
    }

    func finishRoutineState(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRoutineState(lease: lease), saved.command.operationId == operation,
            saved.receipt != nil || saved.conflicted
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM routine_state_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func writeRoutineState(_ saved: SavedRoutineState, lease: OfflineLease) throws {
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE routine_state_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }
}
