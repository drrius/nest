import Foundation

struct NotificationPreferences: Codable, Equatable, Sendable {
    var dailySummaryEnabled: Bool
    var dailySummaryTime: String
    var itemRemindersEnabled: Bool

    func validated() throws -> Self {
        guard dailySummaryTime.range(of: #"\A([01][0-9]|2[0-3]):[0-5][0-9]\z"#, options: .regularExpression) != nil else {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct NotificationProfile: Codable, Equatable, Sendable {
    let revision: String
    let preferences: NotificationPreferences
}

struct NotificationProfileEnvelope: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let timeZone: String
    let profile: NotificationProfile?

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            timeZone == "Europe/Zurich"
        else { throw NestAPIFailure.contract }
        if let profile {
            guard MealRevision.valid(profile.revision), profile.revision != "0" else { throw NestAPIFailure.contract }
            _ = try profile.preferences.validated()
        }
        return self
    }
}

struct SaveNotificationPreferences: Codable, Equatable, Sendable {
    let operationId: UUID
    let expectedRevision: String
    let preferences: NotificationPreferences

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max else {
            throw NestAPIFailure.invalid
        }
        _ = try preferences.validated()
        return self
    }
}

struct NotificationPreferenceReceipt: Codable, Equatable, Sendable {
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let revision: String

    func validated(member: VerifiedMember, command: SaveNotificationPreferences) throws -> Self {
        _ = try command.validated()
        guard actorId == member.userId, householdId == member.householdId, operationId == command.operationId,
            let previous = Int64(command.expectedRevision), revision == String(previous + 1)
        else { throw NestAPIFailure.contract }
        return self
    }
}
