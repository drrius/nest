import Foundation

struct RecurringResumeApproval: Codable, Sendable {
    let id: UUID
    let operationId: UUID
    let change: RecurringResumeInput
    let status: RecurringApproval.Status
    let expiresAt: String
    let reviewedOn: CivilDate
    let receipt: RecurringResumeReceipt?
}

struct RecurringResumeApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: RecurringResumeApproval

    func validated(member: VerifiedMember, approvalId: UUID) throws -> Self {
        try approval.change.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == approvalId, ApprovalTime.date(approval.expiresAt) != nil,
            (approval.status == .consumed) == (approval.receipt != nil)
        else { throw NestAPIFailure.contract }
        if let receipt = approval.receipt {
            try receipt.configuration.validated(member: member)
            guard receipt.version == 1, receipt.actorId == actorId, receipt.householdId == householdId,
                receipt.operationId == approval.operationId, receipt.approvalId == approval.id,
                receipt.change == approval.change, receipt.revision != approval.change.expectedRevision,
                receipt.status == .active, receipt.change.resumeFrom.value >= receipt.configuration.startDate.value,
                try RecurringDates.firstUncovered(
                    schedule: receipt.configuration.schedule, from: receipt.change.resumeFrom,
                    coveredThrough: receipt.coveredThrough) == receipt.change.firstDueOn
            else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension RecurringResumeInput {
    func matches(_ rule: RecurringRule, today: CivilDate) -> Bool {
        rule.id == ruleId && rule.revision == expectedRevision && rule.status == .paused
            && resumeFrom.value >= today.value && resumeFrom.value >= rule.configuration.startDate.value
            && (try? RecurringDates.firstUncovered(
                schedule: rule.configuration.schedule, from: resumeFrom,
                coveredThrough: rule.coveredThrough)) == firstDueOn
    }
}

extension MoneyAPI {
    func recurringResumeApproval(token: String, member: VerifiedMember, approvalId: UUID) async throws
        -> RecurringResumeApprovalEnvelope
    {
        let result = try await http.read(
            "v1/money/recurring/resume/approval?approvalId=\(approvalId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringResumeApprovalEnvelope.self)
        return try result.validated(member: member, approvalId: approvalId)
    }
}
