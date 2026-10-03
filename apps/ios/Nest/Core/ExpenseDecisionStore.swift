import Foundation

struct SavedExpenseDecision: Codable, Sendable {
    let decision: ExpenseDecision
    var result: ExpenseApprovalEnvelope?
    var expiry: FinancialApprovalExpiry?

    var isTerminal: Bool {
        expiry?.expiredUnused == true || result.map { [.consumed, .denied].contains($0.approval.status) } == true
    }
}

extension ChoreOfflineStore {
    static func createDecisionRecoveryTables(_ db: SQLiteConnection) throws {
        try createRoutineRecoveryTable(db)
        try createAssistantRecoveryTable(db)
        try createMemoryRecoveryTable(db)
        try createNotificationRecoveryTable(db)
        try createRenewalRecoveryTable(db)
        try createRenewalReminderRecoveryTable(db)
        try createChoreReminderRecoveryTable(db)
        try createMealReminderRecoveryTable(db)
        try createGroceryReminderRecoveryTable(db)
        try createRecurringReminderRecoveryTable(db)
        try createPushRecoveryTable(db)
        try createPushLogoutTable(db)
        try createRecurringStateDecisionTable(db)
        try createRecurringResumeDecisionTable(db)
        try createVariableCycleDecisionTable(db)
        try createManualCycleTable(db)
        try createManualCycleDecisionTable(db)
        try createLegacyConfirmationTable(db)
        try createLegacyConfirmationDecisionTable(db)
        try createLegacyDismissalTable(db)
        try createLegacyDismissalDecisionTable(db)
        try db.run(
            "CREATE TABLE IF NOT EXISTS recurring_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
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
        if let expiry = saved.expiry {
            _ = try expiry.validated(
                member: member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .expense)
            guard expiry.expiredUnused,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
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
        guard var saved = try readExpenseDecision(lease: lease), saved.expiry == nil else {
            throw OfflineFailure.invalidOperation
        }
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

    func expireExpenseDecision(_ evidence: FinancialApprovalExpiry, lease: OfflineLease) throws {
        guard var saved = try readExpenseDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        _ = try evidence.validated(
            member: decisionMember(lease), approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .expense)
        guard evidence.expiredUnused else { throw OfflineFailure.invalidOperation }
        saved.expiry = evidence
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE expense_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func finishExpenseDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readExpenseDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM expense_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func decisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
