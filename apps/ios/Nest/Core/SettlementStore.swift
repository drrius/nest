import Foundation

struct SavedSettlement: Codable, Sendable {
    let command: SaveSettlement
    var result: SettlementRecovery?
    var cancellationRequested: Bool

    init(command: SaveSettlement, result: SettlementRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveSettlement.self, forKey: .command)
        result = try values.decodeIfPresent(SettlementRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readSettlement(lease: OfflineLease) throws -> SavedSettlement? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM settlement_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedSettlement.self, from: data)
        let member = settlementMember(lease)
        _ = try saved.command.settlement.validated(member: member)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueSettlement(_ command: SaveSettlement, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readSettlement(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.settlement.validated(member: settlementMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedSettlement(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO settlement_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileSettlement(_ result: SettlementRecovery, lease: OfflineLease) throws {
        guard var saved = try readSettlement(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: settlementMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.eventId == result.receipt?.eventId else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE settlement_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestSettlementCancellation(lease: OfflineLease) throws {
        guard var saved = try readSettlement(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE settlement_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmSettlement(_ receipt: SettlementReceipt, lease: OfflineLease) throws {
        try reconcileSettlement(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishSettlement(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readSettlement(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM settlement_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func settlementMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
