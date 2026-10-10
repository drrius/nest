import Foundation

struct SavedRecurring: Codable, Sendable {
    let command: SaveRecurring
    var result: RecurringRecovery?
    var cancellationRequested: Bool

    init(command: SaveRecurring, result: RecurringRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveRecurring.self, forKey: .command)
        result = try values.decodeIfPresent(RecurringRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readRecurring(lease: OfflineLease) throws -> SavedRecurring? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurring.self, from: data)
        let member = recurringMember(lease)
        _ = try saved.command.rule.validated(member: recurringMember(lease))
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueRecurring(_ command: SaveRecurring, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecurring(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.rule.validated(member: recurringMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedRecurring(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO recurring_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurring(_ result: RecurringRecovery, lease: OfflineLease) throws {
        guard var saved = try readRecurring(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: recurringMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.revision == result.receipt?.revision else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestRecurringCancellation(lease: OfflineLease) throws {
        guard var saved = try readRecurring(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmRecurring(_ receipt: RecurringReceipt, lease: OfflineLease) throws {
        try reconcileRecurring(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishRecurring(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurring(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func recurringMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
