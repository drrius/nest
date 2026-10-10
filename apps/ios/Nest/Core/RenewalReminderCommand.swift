import Foundation

struct SaveRenewalReminder: Codable, Equatable, Sendable {
    let operationId: UUID
    let renewalId: UUID
    let expectedRenewalRevision: UUID
    let expectedRevision: UUID?
    let settings: RenewalReminderSettings

    enum CodingKeys: String, CodingKey {
        case operationId, renewalId, expectedRenewalRevision, expectedRevision, settings
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(renewalId, forKey: .renewalId)
        try values.encode(expectedRenewalRevision, forKey: .expectedRenewalRevision)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(settings, forKey: .settings)
    }

    func validated(members: [UUID]? = nil) throws -> Self {
        _ = try settings.delivery.validated(members: members)
        guard settings.delivery == settings.delivery.canonical() else { throw NestAPIFailure.invalid }
        return self
    }
}

struct RenewalReminderReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let command: SaveRenewalReminder
    let reminder: RenewalReminder

    func validated(member: VerifiedMember, expected: SaveRenewalReminder) throws -> Self {
        _ = try expected.validated()
        _ = try reminder.validated(id: expected.renewalId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == expected.operationId, command == expected,
            reminder.updatedBy == member.userId, reminder.reviewedRenewalRevision == expected.expectedRenewalRevision,
            reminder.revision != expected.expectedRevision, reminder.settings == expected.settings
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct RenewalReminderRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, cancelled, recorded }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: RenewalReminderReceipt?

    func validated(member: VerifiedMember, command: SaveRenewalReminder) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try command.validated()
        _ = try receipt?.validated(member: member, expected: command)
        return self
    }
}
