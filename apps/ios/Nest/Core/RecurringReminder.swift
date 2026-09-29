import Foundation

struct RecurringReminder: Codable, Equatable, Sendable {
    let ruleId: UUID
    let revision: UUID
    let reviewedRuleRevision: UUID
    let reviewedDueOn: CivilDate
    let updatedBy: UUID
    let settings: ReminderSettings

    func validated(id: UUID) throws -> Self {
        guard ruleId == id else {
            throw NestAPIFailure.contract
        }
        _ = try settings.validated()
        return self
    }
}

struct RecurringReminderContext: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let rule: RecurringRule
    let reminder: RecurringReminder?

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, rule.id == id
        else { throw NestAPIFailure.contract }
        try rule.validated(member: member)
        _ = try reminder?.validated(id: id)
        return self
    }
}

struct SaveRecurringReminder: Codable, Equatable, Sendable {
    let operationId: UUID
    let ruleId: UUID
    let expectedRuleRevision: UUID
    let expectedDueOn: CivilDate
    let expectedRevision: UUID?
    let settings: ReminderSettings

    enum CodingKeys: String, CodingKey {
        case operationId, ruleId, expectedRuleRevision, expectedDueOn, expectedRevision, settings
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(ruleId, forKey: .ruleId)
        try values.encode(expectedRuleRevision, forKey: .expectedRuleRevision)
        try values.encode(expectedDueOn, forKey: .expectedDueOn)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(settings, forKey: .settings)
    }

    func validated(members: [UUID]? = nil) throws -> Self {
        _ = try settings.validated(members: members)
        guard settings == settings.canonical() else {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct RecurringReminderReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let command: SaveRecurringReminder
    let reminder: RecurringReminder

    func validated(member: VerifiedMember, expected: SaveRecurringReminder) throws -> Self {
        _ = try expected.validated()
        _ = try reminder.validated(id: expected.ruleId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == expected.operationId, command == expected,
            reminder.updatedBy == member.userId, reminder.reviewedRuleRevision == expected.expectedRuleRevision,
            reminder.reviewedDueOn == expected.expectedDueOn,
            reminder.revision != expected.expectedRevision, reminder.settings == expected.settings
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct RecurringReminderRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, cancelled, recorded }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: RecurringReminderReceipt?

    func validated(member: VerifiedMember, command: SaveRecurringReminder) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try command.validated()
        _ = try receipt?.validated(member: member, expected: command)
        return self
    }
}
