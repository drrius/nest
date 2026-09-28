import Foundation

struct SavedExpense: Codable, Sendable {
    let command: SaveExpense
    var result: ExpenseRecovery?
    var cancellationRequested: Bool

    init(command: SaveExpense, result: ExpenseRecovery?, cancellationRequested: Bool = false) {
        self.command = command
        self.result = result
        self.cancellationRequested = cancellationRequested
    }

    enum CodingKeys: String, CodingKey { case command, result, cancellationRequested }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        command = try values.decode(SaveExpense.self, forKey: .command)
        result = try values.decodeIfPresent(ExpenseRecovery.self, forKey: .result)
        cancellationRequested = try values.decodeIfPresent(Bool.self, forKey: .cancellationRequested) ?? false
    }
}

extension ChoreOfflineStore {
    func readExpense(lease: OfflineLease) throws -> SavedExpense? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM expense_commands WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedExpense.self, from: data)
        let member = expenseMember(lease)
        _ = try saved.command.expense.validated(member: member)
        if let result = saved.result { _ = try result.validated(member: member, command: saved.command) }
        return saved
    }

    func enqueueExpense(_ command: SaveExpense, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readExpense(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try command.expense.validated(member: expenseMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedExpense(command: command, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO expense_commands(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileExpense(_ result: ExpenseRecovery, lease: OfflineLease) throws {
        guard var saved = try readExpense(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.validated(member: expenseMember(lease), command: saved.command)
        if let previous = saved.result, previous.status != .unresolved {
            guard previous.status == result.status, previous.receipt?.eventId == result.receipt?.eventId else {
                throw OfflineFailure.invalidOperation
            }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE expense_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func requestExpenseCancellation(lease: OfflineLease) throws {
        guard var saved = try readExpense(lease: lease) else { throw OfflineFailure.invalidOperation }
        guard saved.result == nil || saved.result?.status == .unresolved else { return }
        saved.cancellationRequested = true
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE expense_commands SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func confirmExpense(_ receipt: ExpenseReceipt, lease: OfflineLease) throws {
        try reconcileExpense(
            .init(
                version: receipt.version, actorId: receipt.actorId, householdId: receipt.householdId,
                operationId: receipt.operationId, status: .recorded, receipt: receipt), lease: lease)
    }

    /// Only a confirmed server outcome can release the slot for another financial operation.
    func finishExpense(operation: UUID, lease: OfflineLease) throws {
        guard let saved = try readExpense(lease: lease), saved.command.operationId == operation,
            let result = saved.result, result.status != .unresolved
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM expense_commands WHERE actor=? AND household=?", lease.scope)
    }

    private func expenseMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
