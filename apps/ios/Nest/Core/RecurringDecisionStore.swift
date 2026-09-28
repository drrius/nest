import Foundation

struct SavedRecurringDecision: Codable, Sendable {
    let decision: RecurringDecision
    var result: RecurringApprovalEnvelope?
}

extension ChoreOfflineStore {
    func readRecurringDecision(lease: OfflineLease) throws -> SavedRecurringDecision? {
        try authorize(lease)
        let rows = try db.rows("SELECT body FROM recurring_decisions WHERE actor=? AND household=?", lease.scope)
        guard let body = rows.first?.first, let data = body.data(using: .utf8) else { return nil }
        let saved = try JSONDecoder().decode(SavedRecurringDecision.self, from: data)
        let member = decisionMember(lease)
        try saved.decision.rule.validated(member: member)
        if let result = saved.result { _ = try result.matching(saved.decision, member: member, terminal: false) }
        return saved
    }

    func enqueueRecurringDecision(_ decision: RecurringDecision, lease: OfflineLease) throws {
        try authorize(lease)
        guard try readRecurringDecision(lease: lease) == nil else { throw OfflineFailure.invalidOperation }
        try decision.rule.validated(member: decisionMember(lease))
        let body = String(
            decoding: try JSONEncoder().encode(SavedRecurringDecision(decision: decision, result: nil)), as: UTF8.self)
        try db.run("INSERT INTO recurring_decisions(actor,household,body) VALUES(?,?,?)", lease.scope + [body])
    }

    func reconcileRecurringDecision(_ result: RecurringApprovalEnvelope, lease: OfflineLease) throws {
        guard var saved = try readRecurringDecision(lease: lease) else { throw OfflineFailure.invalidOperation }
        _ = try result.matching(saved.decision, member: decisionMember(lease), terminal: false)
        if let previous = saved.result, [.consumed, .denied].contains(previous.approval.status) {
            guard previous.approval.status == result.approval.status,
                previous.approval.receipt?.revision == result.approval.receipt?.revision
            else { throw OfflineFailure.invalidOperation }
        }
        saved.result = result
        let body = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        try db.run("UPDATE recurring_decisions SET body=? WHERE actor=? AND household=?", [body] + lease.scope)
    }

    func finishRecurringDecision(approvalId: UUID, lease: OfflineLease) throws {
        guard let saved = try readRecurringDecision(lease: lease), saved.decision.approvalId == approvalId,
            let result = saved.result, [.consumed, .denied].contains(result.approval.status)
        else { throw OfflineFailure.invalidOperation }
        try db.run("DELETE FROM recurring_decisions WHERE actor=? AND household=?", lease.scope)
    }

    private func decisionMember(_ lease: OfflineLease) -> VerifiedMember {
        .init(userId: lease.actor, householdId: lease.household, displayName: "")
    }
}
