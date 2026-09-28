import Foundation

struct SavedVariableCycle: Codable, Sendable {
    let command: SaveVariableCycle
    var result: VariableCycleRecovery?
    var cancellationRequested: Bool

    init(command: SaveVariableCycle, result: VariableCycleRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveVariableCycle.self, forKey: .command)
        result = try values.decodeIfPresent(VariableCycleRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readVariableCycle(lease: OfflineLease) throws -> SavedVariableCycle? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM variable_cycle_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedVariableCycle.self, from: data)
        let member = variableCycleMember(lease)
        _ = try saved.command.input.validated(member: member)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueVariableCycle(_ command: SaveVariableCycle, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readVariableCycle(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.input.validated(member: variableCycleMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedVariableCycle(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO variable_cycle_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileVariableCycle(_ result: VariableCycleRecovery, lease: OfflineLease) throws {
        guard var saved = try readVariableCycle(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: variableCycleMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.eventId == result.receipt?.eventId else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE variable_cycle_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestVariableCycleCancellation(lease: OfflineLease) throws {
        guard var saved = try readVariableCycle(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE variable_cycle_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmVariableCycle(_ receipt: VariableCycleReceipt, lease: OfflineLease) throws {
        try reconcileVariableCycle(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishVariableCycle(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readVariableCycle(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM variable_cycle_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func variableCycleMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
