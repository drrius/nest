import Foundation

struct SavedManualCycleDecision: Codable, Sendable {
    let decision: ManualCycleDecision
    let reviewedContext: ManualCycleContext
    var result: ManualCycleApprovalEnvelope?
    var expiry: FinancialApprovalExpiry?
    var conflict: ManualCycleConflictEvidence?

    var isTerminal: Bool {
        expiry?.expiredUnused == true || conflict != nil
            || result.map { [.consumed, .denied].contains($0.approval.status) } == true
    }
}

extension ChoreOfflineStore {
    static func createManualCycleDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS manual_cycle_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readManualCycleDecision(lease: OfflineLease) throws -> SavedManualCycleDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM manual_cycle_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedManualCycleDecision.self, from: data)
        let member = manualDecisionMember(lease)
        _ = try saved.reviewedContext.validated(
            member: member, approvalId: saved.decision.approvalId, input: saved.decision.input)
        guard !saved.decision.approved || saved.reviewedContext.matches
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
                operationId: saved.decision.operationId, command: .linkCycle)
            guard expiry.expiredUnused,
                saved.result.map({ [.pending, .approved].contains($0.approval.status) }) != false
            else { throw OfflineFailure.invalidOperation }
        }
        return saved
    }

    func enqueueManualCycleDecision(
        _ decision: ManualCycleDecision, context: ManualCycleContext, lease: OfflineLease
    ) throws {
        try authorize(lease)
        guard try readManualCycleDecision(lease: lease) == nil, !decision.approved || context.matches
        else { throw OfflineFailure.invalidOperation }
        _ = try context.validated(
            member: manualDecisionMember(lease), approvalId: decision.approvalId, input: decision.input)
        let saved = SavedManualCycleDecision(decision: decision, reviewedContext: context, result: nil)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO manual_cycle_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileManualCycleDecision(_ result: ManualCycleApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readManualCycleDecision(lease: lease), saved.expiry == nil, saved.conflict == nil else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: manualDecisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateManualCycleDecision(saved, lease: lease)
    }

    func expireManualCycleDecision(_ evidence: FinancialApprovalExpiry, lease: OfflineLease) throws {
        guard var saved = try readManualCycleDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        _ = try evidence.validated(
            member: manualDecisionMember(lease), approvalId: saved.decision.approvalId,
            operationId: saved.decision.operationId, command: .linkCycle)
        guard evidence.expiredUnused else { throw OfflineFailure.invalidOperation }
        saved.expiry = evidence
        try updateManualCycleDecision(saved, lease: lease)
    }

    func finishManualCycleDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readManualCycleDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM manual_cycle_decisions WHERE actor=? AND household=?", lease.scope)
    }

    func retireManualCycleDecision(_ evidence: ManualCycleConflictEvidence, lease: OfflineLease) throws {
        guard var saved = try readManualCycleDecision(lease: lease), !saved.isTerminal else {
            throw OfflineFailure.invalidOperation
        }
        try evidence.validated(member: manualDecisionMember(lease), decision: saved.decision)
        saved.conflict = evidence
        try updateManualCycleDecision(saved, lease: lease)
    }

    private func updateManualCycleDecision(_ saved: SavedManualCycleDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE manual_cycle_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func manualDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
