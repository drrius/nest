import Foundation

/// Retained PostgreSQL financial dates are not limited to Foundation's ordinary UI date range.
enum MoneyTime {
    static func date(_ value: String) -> Bool {
        if infinite(value) { return true }
        guard let parts = captures(#"\A([0-9]{4,7})-([0-9]{2})-([0-9]{2})( BC)?\z"#, value),
            let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
            year >= 1, year <= (parts[3].isEmpty ? 5_874_897 : 4713), (1...12).contains(month)
        else { return false }
        let astronomical = parts[3].isEmpty ? year : 1 - year
        let leap = astronomical % 4 == 0 && (astronomical % 100 != 0 || astronomical % 400 == 0)
        let lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return day >= 1 && day <= lengths[month - 1]
    }

    static func timestamp(_ value: String) -> Bool {
        if infinite(value) { return true }
        guard
            let parts = captures(
                #"\A([0-9]{4,6}-[0-9]{2}-[0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})\.[0-9]{6}Z( BC)?\z"#, value),
            date(parts[0] + parts[4]), let year = Int(parts[0].prefix(while: { $0 != "-" })), year <= 294_276,
            let hour = Int(parts[1]), let minute = Int(parts[2]), let second = Int(parts[3])
        else { return false }
        return hour < 24 && minute < 60 && second < 60
    }

    static func order(_ value: String) -> Bool {
        captures(#"\A(?:-?infinity|0|-?[1-9][0-9]{0,19})\z"#, value) != nil
    }

    static func compare(_ lhs: String, _ rhs: String) -> Int {
        if lhs == rhs { return 0 }
        if lhs == "infinity" || rhs == "-infinity" { return 1 }
        if lhs == "-infinity" || rhs == "infinity" { return -1 }
        let negative = lhs.hasPrefix("-")
        if negative != rhs.hasPrefix("-") { return negative ? -1 : 1 }
        let left = negative ? String(lhs.dropFirst()) : lhs
        let right = negative ? String(rhs.dropFirst()) : rhs
        let magnitude = left.count == right.count ? (left > right ? 1 : -1) : (left.count > right.count ? 1 : -1)
        return negative ? -magnitude : magnitude
    }

    private static func infinite(_ value: String) -> Bool { value == "infinity" || value == "-infinity" }

    private static func captures(_ pattern: String, _ value: String) -> [String]? {
        guard let expression = try? NSRegularExpression(pattern: pattern),
            let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value))
        else { return nil }
        return (1..<match.numberOfRanges).map {
            Range(match.range(at: $0), in: value).map { String(value[$0]) } ?? ""
        }
    }
}
