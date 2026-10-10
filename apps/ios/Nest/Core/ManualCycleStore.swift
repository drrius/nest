import Foundation

struct SavedManualCycle: Codable, Sendable {
    let command: SaveManualCycle
    var result: ManualCycleRecovery?
    var cancellationRequested: Bool

    init(command: SaveManualCycle, result: ManualCycleRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveManualCycle.self, forKey: .command)
        result = try values.decodeIfPresent(ManualCycleRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    static func createManualCycleTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS manual_cycle_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readManualCycle(lease: OfflineLease) throws -> SavedManualCycle? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM manual_cycle_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedManualCycle.self, from: data)
        let member = manualCycleMember(lease)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueManualCycle(_ command: SaveManualCycle, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readManualCycle(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        let body = String(
            decoding: try JSONEncoder().encode(SavedManualCycle(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO manual_cycle_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileManualCycle(_ result: ManualCycleRecovery, lease: OfflineLease) throws {
        guard var saved = try readManualCycle(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: manualCycleMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE manual_cycle_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestManualCycleCancellation(lease: OfflineLease) throws {
        guard var saved = try readManualCycle(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE manual_cycle_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmManualCycle(_ receipt: ManualCycleReceipt, lease: OfflineLease) throws {
        try reconcileManualCycle(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishManualCycle(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readManualCycle(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM manual_cycle_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func manualCycleMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
