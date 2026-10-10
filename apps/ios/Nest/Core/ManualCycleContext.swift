import Foundation

struct ManualCycleContext: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approvalId: UUID
    let input: ManualCycleInput
    let target: RecurringDetail
    let detail: MoneyDetail
    let linked: Bool

    func validated(member: VerifiedMember, approvalId: UUID, input: ManualCycleInput) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            self.approvalId == approvalId, self.input == input
        else { throw NestAPIFailure.contract }
        _ = try target.validated(member: member, ruleId: input.ruleId)
        _ = try detail.validated(member: member, eventId: input.sourceEventId)
        return self
    }

    var matches: Bool {
        !linked && target.rule.id == input.ruleId && detail.event.id == input.sourceEventId
            && target.rule.revision == input.expectedRevision && target.manualCycle?.dueOn == input.dueOn
            && input.eligible(source: detail, cycle: target.manualCycle)
    }

    var permanentlyInvalidated: Bool {
        linked || detail.reversedById != nil || target.rule.revision != input.expectedRevision
            || target.rule.coveredThrough.map { $0.value >= input.dueOn.value } == true
    }
}

extension MoneyAPI {
    func manualCycleContext(token: String, member: VerifiedMember, approval: ManualCycleApproval) async throws
        -> ManualCycleContext
    {
        let result = try await http.read(
            "v1/money/recurring/manual/approval/context?approvalId=\(approval.id.uuidString.lowercased())",
            token: token, household: member.householdId, as: ManualCycleContext.self)
        return try result.validated(member: member, approvalId: approval.id, input: approval.input)
    }
}

extension ManualCycleInput {
    func validated(member: VerifiedMember, balance: MoneyBalance, context: ManualCycleContext) throws {
        _ = try context.validated(member: member, approvalId: context.approvalId, input: self)
        guard context.matches else { throw NestAPIFailure.conflict }
        try validated(member: member, balance: balance, target: context.target, source: context.detail)
    }
}
