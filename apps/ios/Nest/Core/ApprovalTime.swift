import Foundation

/// Approval deadlines use finite four-digit UTC timestamps, unlike retained ledger dates.
enum ApprovalTime {
    static func date(_ value: String) -> Date? {
        guard value.count == 27, MoneyTime.timestamp(value),
            value.range(
                of: #"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z\z"#,
                options: .regularExpression) != nil
        else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }

    static func isOpen(_ value: String, now: Date) -> Bool {
        guard let expires = date(value) else { return false }
        return now < expires
    }
}
