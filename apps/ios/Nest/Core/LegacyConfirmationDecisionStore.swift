import Foundation

struct SavedLegacyConfirmationDecision: Codable, Sendable {
    let decision: LegacyConfirmationDecision
    let reviewedContext: LegacyConfirmationProposalContext?
    var result: LegacyConfirmationApprovalEnvelope?
    var withdrawalRequested: Bool

    var isTerminal: Bool { result?.approval.isTerminal == true }
    var sending: LegacyConfirmationDecision {
        .init(
            operationId: decision.operationId, approvalId: decision.approvalId, input: decision.input,
            approved: decision.approved && !withdrawalRequested)
    }
}

extension ChoreOfflineStore {
    static func createLegacyConfirmationDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_confirmation_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyConfirmationDecision(lease: OfflineLease) throws -> SavedLegacyConfirmationDecision? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM legacy_confirmation_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyConfirmationDecision.self, from: data)
        let member = legacyConfirmationDecisionMember(lease)
        _ = try saved.decision.input.validated(member: member)
        if let context = saved.reviewedContext {
            _ = try context.validated(
                member: member, approvalId: saved.decision.approvalId, input: saved.decision.input)
        }
        guard !saved.decision.approved || saved.reviewedContext?.matches == true,
            !saved.withdrawalRequested || saved.decision.approved
        else { throw OfflineFailure.invalidOperation }
        if let result = saved.result {
            _ = try result.matching(saved.decision, member: member)
            if saved.decision.approved, let receipt = result.approval.receipt {
                guard receipt.reviewed == saved.reviewedContext?.review else { throw OfflineFailure.invalidOperation }
            }
        }
        return saved
    }

    func enqueueLegacyConfirmationDecision(
        _ decision: LegacyConfirmationDecision, context: LegacyConfirmationProposalContext?, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try decision.input.validated(member: legacyConfirmationDecisionMember(lease))
        if let context {
            _ = try context.validated(
                member: legacyConfirmationDecisionMember(lease), approvalId: decision.approvalId, input: decision.input)
        }
        guard !decision.approved || context?.matches == true, try readLegacyConfirmationDecision(lease: lease) == nil
        else {
            throw OfflineFailure.invalidOperation
        }
        let saved = SavedLegacyConfirmationDecision(
            decision: decision, reviewedContext: context, result: nil, withdrawalRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "INSERT INTO legacy_confirmation_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyConfirmationDecision(_ result: LegacyConfirmationApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readLegacyConfirmationDecision(lease: lease) else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: legacyConfirmationDecisionMember(lease))
        if saved.decision.approved, let receipt = result.approval.receipt {
            guard receipt.reviewed == saved.reviewedContext?.review else { throw OfflineFailure.invalidOperation }
        }
        if let previous = saved.result, previous.approval.isTerminal {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateLegacyConfirmationDecision(saved, lease: lease)
    }

    func withdrawLegacyConfirmationDecision(lease: OfflineLease) throws {
        guard var saved = try readLegacyConfirmationDecision(lease: lease), saved.decision.approved else {
            throw OfflineFailure.invalidOperation
        }
        guard !saved.isTerminal else { return }
        saved.withdrawalRequested = true
        try updateLegacyConfirmationDecision(saved, lease: lease)
    }

    func finishLegacyConfirmationDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyConfirmationDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_confirmation_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func updateLegacyConfirmationDecision(_ saved: SavedLegacyConfirmationDecision, lease: OfflineLease) throws
    {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "UPDATE legacy_confirmation_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyConfirmationDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
