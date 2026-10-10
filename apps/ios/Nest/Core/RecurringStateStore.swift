import Foundation

struct SavedRecurringState: Codable, Sendable {
    let command: SaveRecurringState
    var result: RecurringStateRecovery?
    var cancellationRequested: Bool

    init(command: SaveRecurringState, result: RecurringStateRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveRecurringState.self, forKey: .command)
        result = try values.decodeIfPresent(RecurringStateRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readRecurringState(lease: OfflineLease) throws -> SavedRecurringState? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_state_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurringState.self, from: data)
        let member = recurringStateMember(lease)
        _ = try saved.command.change.validated()
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueRecurringState(_ command: SaveRecurringState, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecurringState(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.change.validated()
        let body = String(
            decoding: try JSONEncoder().encode(SavedRecurringState(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO recurring_state_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurringState(_ result: RecurringStateRecovery, lease: OfflineLease) throws {
        guard var saved = try readRecurringState(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: recurringStateMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.revision == result.receipt?.revision else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_state_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestRecurringStateCancellation(lease: OfflineLease) throws {
        guard var saved = try readRecurringState(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_state_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmRecurringState(_ receipt: RecurringStateReceipt, lease: OfflineLease) throws {
        try reconcileRecurringState(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishRecurringState(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringState(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_state_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func recurringStateMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
