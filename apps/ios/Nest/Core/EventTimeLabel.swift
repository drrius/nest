import Foundation

/// How an event endpoint reads on a given day: the time alone when it falls on that day, otherwise a short date as
/// well, so overnight and multi-day events never look like a same-day range.
public enum EventTimeLabel {
    public struct Parts: Equatable, Sendable {
        public let day: String?
        public let time: String
    }

    public static func parts(
        _ date: Date, on day: Date, calendar: Calendar = .current, locale: Locale = .current
    ) -> Parts {
        let base = Date.FormatStyle(locale: locale, calendar: calendar, timeZone: calendar.timeZone)
        let time = date.formatted(base.hour().minute())
        guard !calendar.isDate(date, inSameDayAs: day) else { return Parts(day: nil, time: time) }
        return Parts(day: date.formatted(base.month(.abbreviated).day()), time: time)
    }
}
