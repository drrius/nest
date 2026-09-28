import Foundation

struct SavedCorrectionDecision: Codable, Sendable {
    let decision: CorrectionDecision
    var result: CorrectionApprovalEnvelope?
}

extension ChoreOfflineStore {
    func readCorrectionDecision(lease: OfflineLease) throws -> SavedCorrectionDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM correction_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedCorrectionDecision.self, from: data)
        let member = decisionMember(lease)
        _ = try saved.decision.correction.validated(member: member)
        if let result = saved.result { _ = try result.matching(saved.decision, member: member, terminal: false) }
        return saved
    }

    func enqueueCorrectionDecision(_ decision: CorrectionDecision, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readCorrectionDecision(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        _ = try decision.correction.validated(member: decisionMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedCorrectionDecision(decision: decision, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO correction_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileCorrectionDecision(_ result: CorrectionApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readCorrectionDecision(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.matching(saved.decision, member: decisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.reversalEventId == result.approval.receipt?.reversalEventId,
                previous.approval.receipt?.replacementEventId == result.approval.receipt?.replacementEventId
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE correction_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func finishCorrectionDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readCorrectionDecision(lease: lease), saved.decision.approvalId == approvalId,
            let result = saved.result, [.consumed, .denied].contains(result.approval.status)
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM correction_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func decisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
