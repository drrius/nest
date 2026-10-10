import Foundation

struct NotificationAPI: Sendable {
    let http: NestHTTP

    func read(token: String, member: VerifiedMember) async throws -> NotificationProfileEnvelope {
        let result = try await http.read(
            "v1/notification-preferences", token: token, household: member.householdId,
            as: NotificationProfileEnvelope.self)
        return try result.validated(member: member)
    }

    func save(token: String, member: VerifiedMember, command: SaveNotificationPreferences) async throws
        -> NotificationPreferenceReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/notification-preferences/save", token: token, household: member.householdId,
            body: command, as: NotificationSaveEnvelope.self)
        guard result.version == 1 else { throw NestAPIFailure.contract }
        return try result.receipt.validated(member: member, command: command)
    }
}

private struct NotificationSaveEnvelope: Decodable {
    let version: Int
    let receipt: NotificationPreferenceReceipt
}
