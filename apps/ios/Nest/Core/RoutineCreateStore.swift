import Foundation

struct SavedRoutineCreation: Codable, Equatable, Sendable {
    let command: CreateRoutine
    var receipt: RoutineCreateReceipt?
    var cancellationRequested: Bool?
    var cancellation: RoutineCancellation?

    func validated(_ lease: OfflineLease) throws -> Self {
        _ = try command.validated()
        let member = VerifiedMember(userId: lease.actor, householdId: lease.household, displayName: "")
        _ = try receipt?.validated(member: member, command: command)
        if let cancellation {
            _ = try cancellation.validated(member: member, command: command)
            guard cancellationRequested == true, cancellation.receipt == receipt else { throw OfflineFailure.storage }
        }
        return self
    }
}

extension ChoreOfflineStore {
    static func createRoutineRecoveryTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS routine_state_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS routine_creations (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRoutineCreation(lease: OfflineLease) throws -> SavedRoutineCreation? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM routine_creations WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        return try JSONDecoder().decode(SavedRoutineCreation.self, from: data).validated(lease)
    }

    func enqueueRoutineCreation(_ command: CreateRoutine, lease: OfflineLease) throws {
        guard try readRoutineCreation(lease: lease) == nil else { throw OfflineFailure.alreadyQueued }
        let saved = try SavedRoutineCreation(command: command, receipt: nil).validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO routine_creations(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func acknowledgeRoutineCreation(_ receipt: RoutineCreateReceipt, lease: OfflineLease) throws {
        guard var saved = try readRoutineCreation(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.cancellation?.status != .cancelled else { throw OfflineFailure.invalidOperation }
        if let previous = saved.receipt {
            guard previous == receipt else { throw OfflineFailure.invalidOperation }
            return
        }
        saved.receipt = receipt
        _ = try saved.validated(lease)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE routine_creations SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    // An uncertain request cannot be erased: replay must establish its outcome first.
    func finishRoutineCreation(operationId: UUID, lease: OfflineLease) throws {
        guard let saved = try readRoutineCreation(lease: lease), saved.command.operationId == operationId,
            saved.receipt != nil || saved.cancellation?.status == .cancelled
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM routine_creations WHERE actor=? AND household=?", lease.scope)
    }
}
