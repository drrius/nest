import Foundation

struct SavedLegacyAdoptionDecision: Codable, Sendable {
    let decision: LegacyAdoptionDecision
    let reviewedContext: LegacyAdoptionProposalContext?
    var result: LegacyAdoptionApprovalEnvelope?
    var withdrawalRequested: Bool

    var isTerminal: Bool { result?.approval.isTerminal == true }
    var sending: LegacyAdoptionDecision {
        .init(
            operationId: decision.operationId, approvalId: decision.approvalId, input: decision.input,
            approved: decision.approved && !withdrawalRequested)
    }
}

extension ChoreOfflineStore {
    static func createLegacyAdoptionDecisionTable(_ db: SQLiteConnection) throws {
        try db.run(
            "CREATE TABLE IF NOT EXISTS legacy_adoption_decisions (actor TEXT NOT NULL, household TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(actor,household))"
        )
    }

    func readLegacyAdoptionDecision(lease: OfflineLease) throws -> SavedLegacyAdoptionDecision? {
        try authorize(lease)
        let rows = try db.rows(
            "SELECT body FROM legacy_adoption_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedLegacyAdoptionDecision.self, from: data)
        let member = legacyAdoptionDecisionMember(lease)
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

    func enqueueLegacyAdoptionDecision(
        _ decision: LegacyAdoptionDecision, context: LegacyAdoptionProposalContext?, lease: OfflineLease
    ) throws {
        try authorize(lease)
        _ = try decision.input.validated(member: legacyAdoptionDecisionMember(lease))
        if let context {
            _ = try context.validated(
                member: legacyAdoptionDecisionMember(lease), approvalId: decision.approvalId, input: decision.input)
        }
        guard !decision.approved || context?.matches == true, try readLegacyAdoptionDecision(lease: lease) == nil
        else {
            throw OfflineFailure.invalidOperation
        }
        let saved = SavedLegacyAdoptionDecision(
            decision: decision, reviewedContext: context, result: nil, withdrawalRequested: false)
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "INSERT INTO legacy_adoption_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileLegacyAdoptionDecision(_ result: LegacyAdoptionApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readLegacyAdoptionDecision(lease: lease) else {
            throw OfflineFailure.invalidOperation
        }
        _ = try result.matching(saved.decision, member: legacyAdoptionDecisionMember(lease))
        if saved.decision.approved, let receipt = result.approval.receipt {
            guard receipt.reviewed == saved.reviewedContext?.review else { throw OfflineFailure.invalidOperation }
        }
        if let previous = saved.result, previous.approval.isTerminal {
            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            guard try encoder.encode(previous) == encoder.encode(result) else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        try updateLegacyAdoptionDecision(saved, lease: lease)
    }

    func withdrawLegacyAdoptionDecision(lease: OfflineLease) throws {
        guard var saved = try readLegacyAdoptionDecision(lease: lease), saved.decision.approved else {
            throw OfflineFailure.invalidOperation
        }
        guard !saved.isTerminal else { return }
        saved.withdrawalRequested = true
        try updateLegacyAdoptionDecision(saved, lease: lease)
    }

    func finishLegacyAdoptionDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readLegacyAdoptionDecision(lease: lease), saved.decision.approvalId == approvalId,
            saved.isTerminal
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM legacy_adoption_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func updateLegacyAdoptionDecision(_ saved: SavedLegacyAdoptionDecision, lease: OfflineLease) throws {
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run(
            "UPDATE legacy_adoption_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    private func legacyAdoptionDecisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
