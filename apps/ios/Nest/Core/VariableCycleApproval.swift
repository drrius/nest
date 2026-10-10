import Foundation

struct VariableCycleApproval: Codable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let input: VariableCycleInput
    let status: Status
    let expiresAt: String
    let receipt: VariableCycleReceipt?
}

struct VariableCycleApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: VariableCycleApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        try approval.input.validated(member: member)
        if let receipt = approval.receipt {
            _ = try receipt.validated(
                member: member, command: .init(operationId: approval.operationId, input: approval.input),
                approvalId: approval.id)
        }
        return self
    }
}

extension VariableCycleInput {
    func matches(_ detail: RecurringDetail) -> Bool {
        let rule = detail.rule
        return rule.id == ruleId && rule.revision == expectedRevision && rule.isDue(on: detail.today)
            && rule.nextDueOn == dueOn && allocations.contains(where: { $0.memberId == rule.configuration.payerId })
            && (try? RecurringDates.firstUncovered(
                schedule: rule.configuration.schedule, from: dueOn, coveredThrough: rule.coveredThrough)) == dueOn
    }
}

extension MoneyAPI {
    func variableCycleApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> VariableCycleApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/variable/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: VariableCycleApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
