import Foundation

enum CalendarBusyTime {
    static func interval(
        start: Date, end: Date, allDay: Bool = false, calendar: Calendar = .current
    ) -> BusyInterval? {
        guard milliseconds(start: start, end: end) != nil else { return nil }
        guard allDay else { return milliseconds(start: start, end: end) }
        let first = calendar.startOfDay(for: start)
        let last: Date
        if end == calendar.startOfDay(for: end) {
            last = end
        } else {
            guard let day = calendar.dateInterval(of: .day, for: end) else { return nil }
            last = day.end
        }
        return milliseconds(start: first, end: last)
    }

    private static func milliseconds(start: Date, end: Date) -> BusyInterval? {
        let first = start.timeIntervalSince1970 * 1000
        let last = end.timeIntervalSince1970 * 1000
        guard first.isFinite, last.isFinite, first >= 0, last <= 253_402_300_799_999, first < last else { return nil }
        return BusyInterval(start: Int64(first.rounded(.down)), end: Int64(last.rounded(.up)))
    }
}
