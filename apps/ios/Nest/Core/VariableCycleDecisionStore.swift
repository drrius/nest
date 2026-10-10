import Foundation

struct SavedVariableCycleDecision: Codable, Sendable {
    let decision: VariableCycleDecision
    let reviewedDetail: RecurringDetail
    var result: VariableCycleApprovalEnvelope?
    var expiry: FinancialApprovalExpiry?
    var conflict: VariableCycleConflictEvidence?

    var isTerminal: Bool {
        expiry?.expiredUnused == true || conflict != nil
            || result.map { [.consumed, .denied].contains($0.approval.status) } == true
    }
}

extension ChoreOfflineStore {
    static func createVariableCycleDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS variable_cycle_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readVariableCycleDecision(lease: OfflineLease) throws -> SavedVariableCycleDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM variable_cycle_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedVariableCycleDecision.self, from: data)
        let member = cycleDecisionMember(lease)
        try saved.decision.input.validated(member: member)
        _ = try saved.reviewedDetail.validated(member: member, ruleId: saved.decision.input.ruleId)
        guard saved.reviewedDetail.rule.id == saved.decision.input.ruleId,
            !saved.decision.approved || saved.decision.input.matches(saved.reviewedDetail)
        else { throw OfflineFailure.invalidOperation }
        if let result = saved.result { _ = try result.matching(saved.decision, member: member, terminal: false) }
        if let conflict = saved.conflict {
            try conflict.validated(member: member, decision: saved.decision)
            guard saved.expiry == nil,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
        if let expiry = saved.expiry {
            _ = try expiry.validated(
                member: member, approvalId: saved.decision.approvalId,
                operationId: saved.decision.operationId, command: .recordCycle)
            guard expiry.expiredUnused,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
        return saved
    }

    func enqueueVariableCycleDecision(
        _ decision: VariableCycleDecision, detail: RecurringDetail, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readVariableCycleDecision(lease: lease) == nil, detail.rule.id == decision.input.ruleId,
            !decision.approved || decision.input.matches(detail)
        else { throw OfflineFailure.invalidOperation }
        try decision.input.validated(member: cycleDecisionMember(lease))
        _ = try detail.validated(member: cycleDecisionMember(lease), ruleId: decision.input.ruleId)
        let saved = SavedVariableCycleDecision(decision: decision, reviewedDetail: detail, result: nil)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO variable_cycle_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileVariableCycleDecision(_ result: VariableCycleApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readVariableCycleDecision(lease: lease), saved.expiry == nil, saved.conflict == nil else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: cycleDecisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.eventId == result.approval.receipt?.eventId
                    && previous.approval.receipt?.configuration == result.approval.receipt?.configuration
                    && previous.approval.receipt?.cycle == result.approval.receipt?.cycle
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateVariableCycleDecision(saved, lease: lease)
    }

    func expireVariableCycleDecision(_ evidence: FinancialApprovalExpiry, lease: OfflineLease) throws {
        guard var saved = try readVariableCycleDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        _ = try evidence.validated(
            member: cycleDecisionMember(lease), approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .recordCycle)
        guard evidence.expiredUnused else { throw OfflineFailure.invalidOperation }
        saved.expiry = evidence
        try updateVariableCycleDecision(saved, lease: lease)
    }

    func finishVariableCycleDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readVariableCycleDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM variable_cycle_decisions WHERE actor=? AND household=?", lease.scope)
    }

    func retireVariableCycleDecision(_ evidence: VariableCycleConflictEvidence, lease: OfflineLease) throws {
        guard var saved = try readVariableCycleDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        try evidence.validated(member: cycleDecisionMember(lease), decision: saved.decision)
        saved.conflict = evidence
        try updateVariableCycleDecision(saved, lease: lease)
    }

    private func updateVariableCycleDecision(_ saved: SavedVariableCycleDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE variable_cycle_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func cycleDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
