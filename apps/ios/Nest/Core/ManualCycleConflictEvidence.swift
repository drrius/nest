import Foundation

struct ManualCycleConflictEvidence: Codable, Sendable {
    let context: ManualCycleContext
    let fencedApproval: ManualCycleApprovalEnvelope

    func validated(member: VerifiedMember, decision: ManualCycleDecision) throws {
        _ = try context.validated(member: member, approvalId: decision.approvalId, input: decision.input)
        _ = try fencedApproval.matching(decision, member: member, terminal: false)
        guard decision.approved, context.permanentlyInvalidated,
            [.pending, .approved].contains(fencedApproval.approval.status), fencedApproval.approval.receipt == nil
        else { throw OfflineFailure.invalidOperation }
    }
}
