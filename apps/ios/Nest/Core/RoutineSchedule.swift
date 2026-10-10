import Foundation

public enum RoutineSchedule: Equatable, Sendable, Codable {
    case oneOff(CivilDate)
    case daily
    case weekdays([Int])
    case weekly(Int)
    case biweekly(Int)
    case monthly(Int)
    case afterCompletion(every: Int, unit: IntervalUnit)

    public enum IntervalUnit: String, Codable, Sendable { case days, weeks }
    private enum Keys: String, CodingKey { case kind, date, days, weekday, dayOfMonth, every, unit }

    public func validated() throws -> Self {
        let valid: Bool
        switch self {
        case .oneOff, .daily: valid = true
        case .weekdays(let days):
            valid =
                !days.isEmpty && days.count <= 7 && Set(days).count == days.count
                && days.allSatisfy { (1...7).contains($0) }
        case .weekly(let day), .biweekly(let day): valid = (1...7).contains(day)
        case .monthly(let day): valid = (1...31).contains(day)
        case .afterCompletion(let every, _): valid = (1...2_147_483_647).contains(every)
        }
        guard valid else { throw ChoreContractError.invalidSnapshot }
        return self
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: Keys.self)
        switch try values.decode(String.self, forKey: .kind) {
        case "one_off": self = .oneOff(try values.decode(CivilDate.self, forKey: .date))
        case "daily": self = .daily
        case "weekdays": self = .weekdays(try values.decode([Int].self, forKey: .days))
        case "weekly": self = .weekly(try values.decode(Int.self, forKey: .weekday))
        case "biweekly": self = .biweekly(try values.decode(Int.self, forKey: .weekday))
        case "monthly": self = .monthly(try values.decode(Int.self, forKey: .dayOfMonth))
        case "after_completion":
            self = .afterCompletion(
                every: try values.decode(Int.self, forKey: .every),
                unit: try values.decode(IntervalUnit.self, forKey: .unit))
        default: throw ChoreContractError.invalidSnapshot
        }
        _ = try validated()
    }

    public func encode(to encoder: Encoder) throws {
        _ = try validated()
        var values = encoder.container(keyedBy: Keys.self)
        switch self {
        case .oneOff(let date):
            try values.encode("one_off", forKey: .kind)
            try values.encode(date, forKey: .date)
        case .daily: try values.encode("daily", forKey: .kind)
        case .weekdays(let days):
            try values.encode("weekdays", forKey: .kind)
            try values.encode(days, forKey: .days)
        case .weekly(let day):
            try values.encode("weekly", forKey: .kind)
            try values.encode(day, forKey: .weekday)
        case .biweekly(let day):
            try values.encode("biweekly", forKey: .kind)
            try values.encode(day, forKey: .weekday)
        case .monthly(let day):
            try values.encode("monthly", forKey: .kind)
            try values.encode(day, forKey: .dayOfMonth)
        case .afterCompletion(let every, let unit):
            try values.encode("after_completion", forKey: .kind)
            try values.encode(every, forKey: .every)
            try values.encode(unit, forKey: .unit)
        }
    }
}
