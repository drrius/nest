import Foundation

struct RecurringInput: Codable, Equatable, Sendable {
    let ruleId: UUID
    let expectedRevision: UUID?
    let configuration: RecurringConfiguration
    let firstDueOn: CivilDate

    func validated(member: VerifiedMember) throws {
        try configuration.validated(member: member)
        guard firstDueOn.value >= configuration.startDate.value,
            try RecurringDates.firstUncovered(
                schedule: configuration.schedule, from: firstDueOn,
                coveredThrough: nil) == firstDueOn
        else { throw NestAPIFailure.invalid }
    }
    enum CodingKeys: String, CodingKey { case ruleId, expectedRevision, configuration, firstDueOn }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(ruleId, forKey: .ruleId)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(configuration, forKey: .configuration)
        try values.encode(firstDueOn, forKey: .firstDueOn)
    }
}

struct SaveRecurring: Codable, Equatable, Sendable {
    let operationId: UUID
    let rule: RecurringInput
}

struct RecurringReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let revision: UUID
    let status: RecurringRule.Status
    let rule: RecurringInput

    func validated(member: VerifiedMember, command: SaveRecurring) throws -> Self {
        try rule.validated(member: member)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, rule == command.rule,
            status == .active || status == .paused
        else { throw NestAPIFailure.contract }
        return self
    }
}
