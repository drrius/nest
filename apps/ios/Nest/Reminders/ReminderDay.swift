import Foundation

enum ReminderDay {
    static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = ReminderClock.zone
        return value
    }
    static var formatter: DateFormatter {
        let value = DateFormatter()
        value.calendar = calendar
        value.locale = Locale(identifier: "en_US_POSIX")
        value.timeZone = ReminderClock.zone
        value.dateFormat = "yyyy-MM-dd"
        return value
    }
    static func day(_ date: Date) -> CivilDate? { try? CivilDate(formatter.string(from: date)) }
    static func date(_ day: CivilDate) -> Date { formatter.date(from: day.value)! }
}
