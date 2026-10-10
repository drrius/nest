import Foundation

struct RecurringResumeInput: Codable, Equatable, Sendable {
    let ruleId: UUID
    let expectedRevision: UUID
    let expectedStatus: String
    let action: String
    let resumeFrom: CivilDate
    let firstDueOn: CivilDate

    func validated() throws {
        guard expectedStatus == "paused", action == "resume", firstDueOn.value >= resumeFrom.value else {
            throw NestAPIFailure.invalid
        }
    }
}

struct SaveRecurringResume: Codable, Equatable, Sendable {
    let operationId: UUID
    let change: RecurringResumeInput
}

struct RecurringResumeReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let revision: UUID
    let status: RecurringRule.Status
    let change: RecurringResumeInput
    let configuration: RecurringConfiguration
    let coveredThrough: CivilDate?

    func validated(member: VerifiedMember, command: SaveRecurringResume) throws -> Self {
        try change.validated()
        try configuration.validated(member: member)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, change == command.change,
            revision != change.expectedRevision, status == .active,
            change.resumeFrom.value >= configuration.startDate.value,
            try RecurringDates.firstUncovered(
                schedule: configuration.schedule, from: change.resumeFrom,
                coveredThrough: coveredThrough) == change.firstDueOn
        else { throw NestAPIFailure.contract }
        return self
    }
}
