import Foundation

struct SavedRecurringResumeDecision: Codable, Sendable {
    let decision: RecurringResumeDecision
    let reviewedRule: RecurringRule
    var result: RecurringResumeApprovalEnvelope?
    var expiry: FinancialApprovalExpiry?

    var datePassedUnused: Bool {
        decision.approved
            && result.map {
                [.pending, .approved].contains($0.approval.status)
                    && $0.approval.reviewedOn.value > decision.change.resumeFrom.value
            } == true
    }

    var isTerminal: Bool {
        datePassedUnused || expiry?.expiredUnused == true
            || result.map { [.consumed, .denied].contains($0.approval.status) } == true
    }
}

extension ChoreOfflineStore {
    static func createRecurringResumeDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS recurring_resume_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readRecurringResumeDecision(lease: OfflineLease) throws -> SavedRecurringResumeDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_resume_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurringResumeDecision.self, from: data)
        let member = resumeDecisionMember(lease)
        try saved.decision.change.validated()
        try saved.reviewedRule.validated(member: member)
        guard saved.reviewedRule.id == saved.decision.change.ruleId,
            !saved.decision.approved
                || saved.decision.change.matches(saved.reviewedRule, today: saved.decision.change.resumeFrom)
        else { throw OfflineFailure.invalidOperation }
        if let result = saved.result {
            _ = try result.matching(saved.decision, member: member, terminal: false)
            guard
                result.approval.receipt?.configuration == nil
                    || result.approval.receipt?.configuration == saved.reviewedRule.configuration
            else { throw OfflineFailure.invalidOperation }
        }
        if let expiry = saved.expiry {
            _ = try expiry.validated(
                member: member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .resumeRule)
            guard expiry.expiredUnused,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
        return saved
    }

    func enqueueRecurringResumeDecision(
        _ decision: RecurringResumeDecision, rule: RecurringRule, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readRecurringResumeDecision(lease: lease) == nil, rule.id == decision.change.ruleId,
            !decision.approved || decision.change.matches(rule, today: decision.change.resumeFrom)
        else { throw OfflineFailure.invalidOperation }
        try decision.change.validated()
        try rule.validated(member: resumeDecisionMember(lease))
        let saved = SavedRecurringResumeDecision(decision: decision, reviewedRule: rule, result: nil)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO recurring_resume_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurringResumeDecision(_ result: RecurringResumeApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readRecurringResumeDecision(lease: lease), saved.expiry == nil else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: resumeDecisionMember(lease), terminal: false)
        if saved.datePassedUnused {
            guard [.pending, .approved].contains(result.approval.status),
                result.approval.reviewedOn.value > saved.decision.change.resumeFrom.value
            else { throw OfflineFailure.invalidOperation }
        }
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.revision == result.approval.receipt?.revision
            else { throw OfflineFailure.invalidOperation }
        }
        guard
            result.approval.receipt?.configuration == nil
                || result.approval.receipt?.configuration == saved.reviewedRule.configuration
        else { throw OfflineFailure.invalidOperation }
        saved.result = result
        try updateRecurringResumeDecision(saved, lease: lease)
    }

    func expireRecurringResumeDecision(_ evidence: FinancialApprovalExpiry, lease: OfflineLease) throws {
        guard var saved = try readRecurringResumeDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        _ = try evidence.validated(
            member: resumeDecisionMember(lease), approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .resumeRule)
        guard evidence.expiredUnused else { throw OfflineFailure.invalidOperation }
        saved.expiry = evidence
        try updateRecurringResumeDecision(saved, lease: lease)
    }

    func finishRecurringResumeDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringResumeDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_resume_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func updateRecurringResumeDecision(_ saved: SavedRecurringResumeDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_resume_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func resumeDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
