import Foundation

struct GroceryReminder: Codable, Equatable, Sendable {
    let itemId: UUID
    let revision: UUID
    let reviewedItemVersion: String
    let updatedBy: UUID
    let settings: DatedReminderSettings

    func validated(id: UUID) throws -> Self {
        guard itemId == id, ReminderItemVersion.valid(reviewedItemVersion) else {
            throw NestAPIFailure.contract
        }
        _ = try settings.validated()
        return self
    }
}

struct GroceryReminderContext: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let itemVersion: String
    let grocery: GroceryItem
    let reminder: GroceryReminder?

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, grocery.id == id,
            ReminderItemVersion.valid(itemVersion), grocery.version == itemVersion
        else { throw NestAPIFailure.contract }
        _ = try grocery.validated()
        _ = try reminder?.validated(id: id)
        return self
    }
}

struct SaveGroceryReminder: Codable, Equatable, Sendable {
    let operationId: UUID
    let itemId: UUID
    let expectedItemVersion: String
    let expectedRevision: UUID?
    let settings: DatedReminderSettings

    enum CodingKeys: String, CodingKey {
        case operationId, itemId, expectedItemVersion, expectedRevision, settings
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(itemId, forKey: .itemId)
        try values.encode(expectedItemVersion, forKey: .expectedItemVersion)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(settings, forKey: .settings)
    }

    func validated(members: [UUID]? = nil) throws -> Self {
        _ = try settings.validated(members: members)
        guard ReminderItemVersion.valid(expectedItemVersion), settings == settings.canonical() else {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct GroceryReminderReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let command: SaveGroceryReminder
    let reminder: GroceryReminder

    func validated(member: VerifiedMember, expected: SaveGroceryReminder) throws -> Self {
        _ = try expected.validated()
        _ = try reminder.validated(id: expected.itemId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == expected.operationId, command == expected,
            reminder.updatedBy == member.userId, reminder.reviewedItemVersion == expected.expectedItemVersion,
            reminder.revision != expected.expectedRevision, reminder.settings == expected.settings
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct GroceryReminderRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, cancelled, recorded }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: GroceryReminderReceipt?

    func validated(member: VerifiedMember, command: SaveGroceryReminder) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try command.validated()
        _ = try receipt?.validated(member: member, expected: command)
        return self
    }
}
