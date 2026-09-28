import Foundation

struct SavedRefund: Codable, Sendable {
    let command: SaveRefund
    var result: RefundRecovery?
    var cancellationRequested: Bool

    init(command: SaveRefund, result: RefundRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveRefund.self, forKey: .command)
        result = try values.decodeIfPresent(RefundRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readRefund(lease: OfflineLease) throws -> SavedRefund? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM refund_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRefund.self, from: data)
        let member = refundMember(lease)
        _ = try saved.command.refund.validated(member: member)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueRefund(_ command: SaveRefund, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRefund(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.refund.validated(member: refundMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedRefund(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO refund_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRefund(_ result: RefundRecovery, lease: OfflineLease) throws {
        guard var saved = try readRefund(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: refundMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.eventId == result.receipt?.eventId else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE refund_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestRefundCancellation(lease: OfflineLease) throws {
        guard var saved = try readRefund(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE refund_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmRefund(_ receipt: RefundReceipt, lease: OfflineLease) throws {
        try reconcileRefund(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishRefund(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRefund(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM refund_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func refundMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
