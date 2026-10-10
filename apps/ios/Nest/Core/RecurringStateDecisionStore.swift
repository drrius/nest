import Foundation

struct SavedRecurringStateDecision: Codable, Sendable {
    let decision: RecurringStateDecision
    let reviewedRule: RecurringRule
    var result: RecurringStateApprovalEnvelope?
    var expiry: FinancialApprovalExpiry?

    var isTerminal: Bool {
        expiry?.expiredUnused == true || result.map { [.consumed, .denied].contains($0.approval.status) } == true
    }
}

extension ChoreOfflineStore {
    static func createRecurringStateDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS recurring_state_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRecurringStateDecision(lease: OfflineLease) throws -> SavedRecurringStateDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_state_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurringStateDecision.self, from: data)
        let member = stateDecisionMember(lease)
        try saved.decision.change.validated()
        try saved.reviewedRule.validated(member: member)
        guard saved.reviewedRule.id == saved.decision.change.ruleId,
            !saved.decision.approved || saved.decision.change.matches(saved.reviewedRule)
        else { throw OfflineFailure.invalidOperation }
        if let result = saved.result { _ = try result.matching(saved.decision, member: member, terminal: false) }
        if let expiry = saved.expiry {
            _ = try expiry.validated(
                member: member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: saved.decision.change.command)
            guard expiry.expiredUnused,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
        return saved
    }

    func enqueueRecurringStateDecision(
        _ decision: RecurringStateDecision, rule: RecurringRule, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readRecurringStateDecision(lease: lease) == nil, rule.id == decision.change.ruleId,
            !decision.approved || decision.change.matches(rule)
        else { throw OfflineFailure.invalidOperation }
        try decision.change.validated()
        try rule.validated(member: stateDecisionMember(lease))
        let saved = SavedRecurringStateDecision(decision: decision, reviewedRule: rule, result: nil)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recurring_state_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurringStateDecision(_ result: RecurringStateApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readRecurringStateDecision(lease: lease), saved.expiry == nil else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: stateDecisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.revision == result.approval.receipt?.revision
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateRecurringStateDecision(saved, lease: lease)
    }

    func expireRecurringStateDecision(_ evidence: FinancialApprovalExpiry, lease: OfflineLease) throws {
        guard var saved = try readRecurringStateDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        _ = try evidence.validated(
            member: stateDecisionMember(lease), approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: saved.decision.change.command)
        guard evidence.expiredUnused else { throw OfflineFailure.invalidOperation }
        saved.expiry = evidence
        try updateRecurringStateDecision(saved, lease: lease)
    }

    func finishRecurringStateDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringStateDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_state_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func updateRecurringStateDecision(_ saved: SavedRecurringStateDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_state_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func stateDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
