import Foundation

struct SavedLegacyDismissalDecision: Codable, Sendable {
    let decision: LegacyDismissalDecision
    let reviewedContext: LegacyDismissalProposalContext
    var result: LegacyDismissalApprovalEnvelope?
    var withdrawalRequested: Bool

    var isTerminal: Bool { result?.approval.isTerminal == true }
    var sending: LegacyDismissalDecision {
        .init(
            operationId: decision.operationId, approvalId: decision.approvalId, input: decision.input,
            approved: decision.approved && !withdrawalRequested)
    }
}

extension ChoreOfflineStore {
    static func createLegacyDismissalDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_dismissal_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyDismissalDecision(lease: OfflineLease) throws -> SavedLegacyDismissalDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM legacy_dismissal_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyDismissalDecision.self, from: data)
        let member = legacyDecisionMember(lease)
        _ = try saved.reviewedContext.validated(
            member: member, approvalId: saved.decision.approvalId, input: saved.decision.input)
        guard !saved.decision.approved || saved.reviewedContext.matches,
            !saved.withdrawalRequested || saved.decision.approved
        else { throw OfflineFailure.invalidOperation }
        if let result = saved.result {
            _ = try result.matching(saved.decision, member: member)
            if saved.decision.approved, let receipt = result.approval.receipt {
                guard receipt.reviewed == saved.reviewedContext.review else { throw OfflineFailure.invalidOperation }
            }
        }
        return saved
    }

    func enqueueLegacyDismissalDecision(
        _ decision: LegacyDismissalDecision, context: LegacyDismissalProposalContext, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try context.validated(
            member: legacyDecisionMember(lease), approvalId: decision.approvalId, input: decision.input)
        guard !decision.approved || context.matches, try readLegacyDismissalDecision(lease: lease) == nil else {
            throw OfflineFailure.invalidOperation
        }
        let saved = SavedLegacyDismissalDecision(
            decision: decision, reviewedContext: context, result: nil, withdrawalRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("INSERT INTO legacy_dismissal_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyDismissalDecision(_ result: LegacyDismissalApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readLegacyDismissalDecision(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.matching(saved.decision, member: legacyDecisionMember(lease))
        if saved.decision.approved, let receipt = result.approval.receipt {
            guard receipt.reviewed == saved.reviewedContext.review else { throw OfflineFailure.invalidOperation }
        }
        if let previous = saved.result, previous.approval.isTerminal {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateLegacyDismissalDecision(saved, lease: lease)
    }

    func withdrawLegacyDismissalDecision(lease: OfflineLease) throws {
        guard var saved = try readLegacyDismissalDecision(lease: lease), saved.decision.approved else {
            throw OfflineFailure.invalidOperation
        }
        guard !saved.isTerminal else { return }
        saved.withdrawalRequested = true
        try updateLegacyDismissalDecision(saved, lease: lease)
    }

    func finishLegacyDismissalDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyDismissalDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_dismissal_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func updateLegacyDismissalDecision(_ saved: SavedLegacyDismissalDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE legacy_dismissal_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
