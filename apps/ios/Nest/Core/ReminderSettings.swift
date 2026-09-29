import Foundation

struct ReminderSettings: Codable, Equatable, Sendable {
    var enabled: Bool
    var recipientIds: [UUID]
    var localTime: String
    var daysBefore: Int

    func validated(members: [UUID]? = nil) throws -> Self {
        guard recipientIds.count <= 2, Set(recipientIds).count == recipientIds.count,
            !enabled || !recipientIds.isEmpty, (0...730).contains(daysBefore),
            localTime.range(of: #"\A([01][0-9]|2[0-3]):[0-5][0-9]\z"#, options: .regularExpression) != nil
        else { throw NestAPIFailure.invalid }
        if let members, !recipientIds.allSatisfy({ members.contains($0) }) { throw NestAPIFailure.invalid }
        return self
    }

    func canonical() -> Self {
        var value = self
        value.recipientIds.sort { $0.uuidString < $1.uuidString }
        return value
    }
}

struct RenewalReminderSettings: Codable, Equatable, Sendable {
    enum Anchor: String, Codable, Sendable { case renewal, cancellation }
    var anchor: Anchor
    var delivery: ReminderSettings
}

struct RenewalReminder: Codable, Equatable, Sendable {
    let renewalId: UUID
    let revision: UUID
    let reviewedRenewalRevision: UUID
    let updatedBy: UUID
    let settings: RenewalReminderSettings

    func validated(id: UUID) throws -> Self {
        guard renewalId == id else { throw NestAPIFailure.contract }
        _ = try settings.delivery.validated()
        return self
    }
}

struct RenewalReminderEnvelope: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let renewalId: UUID
    let reminder: RenewalReminder?

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, renewalId == id else {
            throw NestAPIFailure.contract
        }
        _ = try reminder?.validated(id: id)
        return self
    }
}
