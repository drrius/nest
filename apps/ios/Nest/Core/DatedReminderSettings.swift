import Foundation

struct DatedReminderSettings: Codable, Equatable, Sendable {
    var enabled: Bool
    var recipientIds: [UUID]
    var localDate: CivilDate
    var localTime: String

    var delivery: ReminderSettings {
        get { .init(enabled: enabled, recipientIds: recipientIds, localTime: localTime, daysBefore: 0) }
        set {
            enabled = newValue.enabled
            recipientIds = newValue.recipientIds
            localTime = newValue.localTime
        }
    }
    func validated(members: [UUID]? = nil) throws -> Self {
        _ = try delivery.validated(members: members)
        return self
    }
    func canonical() -> Self {
        var value = self
        value.delivery = delivery.canonical()
        return value
    }
}

enum ReminderItemVersion {
    static func valid(_ value: String) -> Bool {
        value.range(of: #"\A[1-9][0-9]{0,18}\z"#, options: .regularExpression) != nil
            && Int64(value) != nil
    }
}
