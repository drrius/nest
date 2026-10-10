import Foundation

struct ChoreReminder: Codable, Equatable, Sendable {
    let occurrenceId: UUID
    let revision: UUID
    let reviewedItemRevision: String
    let updatedBy: UUID
    let settings: ReminderSettings

    func validated(id: UUID) throws -> Self {
        guard occurrenceId == id, ReminderFingerprint.valid(reviewedItemRevision) else {
            throw NestAPIFailure.contract
        }
        _ = try settings.validated()
        return self
    }
}

struct ChoreReminderContext: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let itemRevision: String
    let chore: NestChore
    let reminder: ChoreReminder?

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, chore.id == id,
            !chore.title.isEmpty, ReminderFingerprint.valid(itemRevision)
        else { throw NestAPIFailure.contract }
        _ = try reminder?.validated(id: id)
        return self
    }
}

struct SaveChoreReminder: Codable, Equatable, Sendable {
    let operationId: UUID
    let occurrenceId: UUID
    let expectedItemRevision: String
    let expectedRevision: UUID?
    let settings: ReminderSettings

    enum CodingKeys: String, CodingKey {
        case operationId, occurrenceId, expectedItemRevision, expectedRevision, settings
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(occurrenceId, forKey: .occurrenceId)
        try values.encode(expectedItemRevision, forKey: .expectedItemRevision)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(settings, forKey: .settings)
    }

    func validated(members: [UUID]? = nil) throws -> Self {
        _ = try settings.validated(members: members)
        guard ReminderFingerprint.valid(expectedItemRevision), settings == settings.canonical() else {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct ChoreReminderReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let command: SaveChoreReminder
    let reminder: ChoreReminder

    func validated(member: VerifiedMember, expected: SaveChoreReminder) throws -> Self {
        _ = try expected.validated()
        _ = try reminder.validated(id: expected.occurrenceId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == expected.operationId, command == expected,
            reminder.updatedBy == member.userId, reminder.reviewedItemRevision == expected.expectedItemRevision,
            reminder.revision != expected.expectedRevision, reminder.settings == expected.settings
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct ChoreReminderRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, cancelled, recorded }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: ChoreReminderReceipt?

    func validated(member: VerifiedMember, command: SaveChoreReminder) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try command.validated()
        _ = try receipt?.validated(member: member, expected: command)
        return self
    }
}
