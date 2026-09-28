import Foundation

struct SavedRecurringResume: Codable, Sendable {
    let command: SaveRecurringResume
    var result: RecurringResumeRecovery?
    var cancellationRequested: Bool

    init(command: SaveRecurringResume, result: RecurringResumeRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveRecurringResume.self, forKey: .command)
        result = try values.decodeIfPresent(RecurringResumeRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readRecurringResume(lease: OfflineLease) throws -> SavedRecurringResume? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_resume_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurringResume.self, from: data)
        let member = recurringResumeMember(lease)
        _ = try saved.command.change.validated()
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueRecurringResume(_ command: SaveRecurringResume, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecurringResume(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.change.validated()
        let body = String(
            decoding: try JSONEncoder().encode(SavedRecurringResume(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO recurring_resume_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurringResume(_ result: RecurringResumeRecovery, lease: OfflineLease) throws {
        guard var saved = try readRecurringResume(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: recurringResumeMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.revision == result.receipt?.revision else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_resume_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestRecurringResumeCancellation(lease: OfflineLease) throws {
        guard var saved = try readRecurringResume(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_resume_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmRecurringResume(_ receipt: RecurringResumeReceipt, lease: OfflineLease) throws {
        try reconcileRecurringResume(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishRecurringResume(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringResume(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_resume_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func recurringResumeMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
