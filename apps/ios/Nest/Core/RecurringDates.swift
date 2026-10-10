import Foundation

/// Civil dates only; calculating a cycle grants no authority to post an expense.
enum RecurringDates {
    static func firstUncovered(schedule: RecurringSchedule, from: CivilDate, coveredThrough: CivilDate?) throws
        -> CivilDate?
    {
        guard schedule.valid else { throw NestAPIFailure.invalid }
        if coveredThrough?.value == "9999-12-31" { return nil }
        var bound = date(from)
        if let coveredThrough, coveredThrough.value >= from.value {
            bound = calendar.date(byAdding: .day, value: 1, to: date(coveredThrough))!
        }
        guard let due = first(schedule, from: bound) else { return nil }
        if let coveredThrough, start(schedule, due: due) <= date(coveredThrough) {
            let tomorrow = calendar.date(byAdding: .day, value: 1, to: due)!
            return try first(schedule, from: tomorrow).map(civil)
        }
        return try civil(due)
    }

    static func cycle(schedule: RecurringSchedule, dueOn: CivilDate) throws -> RecurringCycle {
        guard schedule.valid, first(schedule, from: date(dueOn)) == date(dueOn) else { throw NestAPIFailure.invalid }
        let begins = start(schedule, due: date(dueOn))
        let end: Date
        if schedule.kind == .monthly {
            let days = calendar.range(of: .day, in: .month, for: begins)!.count
            end = calendar.date(byAdding: .day, value: days - 1, to: begins)!
        } else {
            end = min(calendar.date(byAdding: .day, value: 6, to: begins)!, date(try CivilDate("9999-12-31")))
        }
        let starts = try civil(begins)
        return .init(
            key: "\(schedule.kind.rawValue):\(starts.value)", dueOn: dueOn, startsOn: starts, through: try civil(end))
    }

    private static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(secondsFromGMT: 0)!
        return value
    }
    private static func date(_ civil: CivilDate) -> Date {
        let parts = civil.value.split(separator: "-").map { Int($0)! }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }
    private static func civil(_ date: Date) throws -> CivilDate {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return try CivilDate(String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!))
    }
    private static func first(_ schedule: RecurringSchedule, from: Date) -> Date? {
        guard calendar.component(.year, from: from) <= 9999 else { return nil }
        if schedule.kind == .weekly {
            let weekday = (calendar.component(.weekday, from: from) + 5) % 7 + 1
            let offset = (schedule.weekday! - weekday + 7) % 7
            let due = calendar.date(byAdding: .day, value: offset, to: from)!
            return calendar.component(.year, from: due) <= 9999 ? due : nil
        }
        var parts = calendar.dateComponents([.year, .month], from: from)
        parts.day = min(schedule.dayOfMonth!, calendar.range(of: .day, in: .month, for: from)!.count)
        let due = calendar.date(from: parts)!
        if due >= from { return due }
        parts.day = 1
        let next = calendar.date(byAdding: .month, value: 1, to: calendar.date(from: parts)!)!
        return first(schedule, from: next)
    }
    private static func start(_ schedule: RecurringSchedule, due: Date) -> Date {
        if schedule.kind == .monthly {
            return calendar.date(from: calendar.dateComponents([.year, .month], from: due))!
        }
        let weekday = (calendar.component(.weekday, from: due) + 5) % 7 + 1
        return calendar.date(byAdding: .day, value: 1 - weekday, to: due)!
    }
}
