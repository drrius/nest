import Foundation

struct SavedExpenseDecision: Codable, Sendable {
    let decision: ExpenseDecision
    var result: ExpenseApprovalEnvelope?
}

extension ChoreOfflineStore {
    static func createFinancialRecoveryTables(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS correction_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS settlement_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS refund_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS variable_cycle_commands (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
        try db.run(
            "CREATE TABLE IF NOT EXISTS expense_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readExpenseDecision(lease: OfflineLease) throws -> SavedExpenseDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM expense_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedExpenseDecision.self, from: data)
        let member = decisionMember(lease)
        _ = try saved.decision.expense.validated(member: member)
        if let result = saved.result { _ = try result.matching(saved.decision, member: member, terminal: false) }
        return saved
    }

    func enqueueExpenseDecision(_ decision: ExpenseDecision, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readExpenseDecision(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try decision.expense.validated(member: decisionMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedExpenseDecision(decision: decision, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO expense_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileExpenseDecision(_ result: ExpenseApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readExpenseDecision(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.matching(saved.decision, member: decisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.eventId == result.approval.receipt?.eventId
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE expense_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func finishExpenseDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readExpenseDecision(lease: lease), saved.decision.approvalId == approvalId,
            let result = saved.result, [.consumed, .denied].contains(result.approval.status)
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM expense_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func decisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
