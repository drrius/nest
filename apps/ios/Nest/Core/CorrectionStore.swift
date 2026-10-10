import Foundation

struct SavedCorrection: Codable, Sendable {
    let command: SaveCorrection
    var result: CorrectionRecovery?
    var cancellationRequested: Bool

    init(command: SaveCorrection, result: CorrectionRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveCorrection.self, forKey: .command)
        result = try values.decodeIfPresent(CorrectionRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readCorrection(lease: OfflineLease) throws -> SavedCorrection? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM correction_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedCorrection.self, from: data)
        let member = correctionMember(lease)
        _ = try saved.command.correction.validated(member: member)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueCorrection(_ command: SaveCorrection, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readCorrection(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.correction.validated(member: correctionMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedCorrection(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO correction_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileCorrection(_ result: CorrectionRecovery, lease: OfflineLease) throws {
        guard var saved = try readCorrection(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: correctionMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status,
                previous.receipt?.reversalEventId == result.receipt?.reversalEventId,
                previous.receipt?.replacementEventId == result.receipt?.replacementEventId
            else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE correction_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestCorrectionCancellation(lease: OfflineLease) throws {
        guard var saved = try readCorrection(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE correction_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmCorrection(_ receipt: CorrectionReceipt, lease: OfflineLease) throws {
        try reconcileCorrection(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishCorrection(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readCorrection(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM correction_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func correctionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
