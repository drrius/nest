import Foundation

struct VariableCycleConflictEvidence: Codable, Sendable {
    let detail: RecurringDetail
    let fencedApproval: VariableCycleApprovalEnvelope

    func validated(member: VerifiedMember, decision: VariableCycleDecision) throws {
        _ = try detail.validated(member: member, ruleId: decision.input.ruleId)
        _ = try fencedApproval.matching(decision, member: member, terminal: false)
        guard decision.approved, decision.input.permanentlyInvalidated(by: detail),
            [.pending, .approved].contains(fencedApproval.approval.status), fencedApproval.approval.receipt == nil
        else { throw OfflineFailure.invalidOperation }
    }
}

extension VariableCycleInput {
    func permanentlyInvalidated(by detail: RecurringDetail) -> Bool {
        detail.rule.id == ruleId
            && (detail.rule.revision != expectedRevision
                || detail.rule.coveredThrough.map { $0.value >= dueOn.value } == true)
    }
}
