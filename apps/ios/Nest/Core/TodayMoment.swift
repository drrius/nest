import Foundation

/// One instant and device civil day for every Today section, including while travelling.
struct TodayMoment: Sendable {
    let now: Date
    let day: CivilDate
    private let timeZone: TimeZone
    private let locale: Locale

    init(now: Date, timeZone: TimeZone = .current, locale: Locale = .current) throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        guard now.timeIntervalSince1970.isFinite, calendar.component(.era, from: now) == 1,
            (1...9999).contains(calendar.component(.year, from: now))
        else { throw CivilDateError.invalid }
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.timeZone = timeZone
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        day = try CivilDate(formatter.string(from: now))
        self.now = now
        self.timeZone = timeZone
        self.locale = locale
    }

    var header: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.locale = locale
        formatter.setLocalizedDateFormatFromTemplate("EEEE d MMMM")
        return formatter.string(from: now)
    }

    func dueLabel(_ due: CivilDate) -> String {
        if due == day { return "Due today" }
        // Civil dates have no timestamp. UTC noon preserves their label even in a skipped local day.
        let label: String
        if let date = due.localDay(timeZone: TimeZone(secondsFromGMT: 0)!) {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.timeZone = TimeZone(secondsFromGMT: 0)!
            formatter.locale = locale
            formatter.setLocalizedDateFormatFromTemplate("d MMM")
            label = formatter.string(from: date)
        } else {
            label = due.value
        }
        return due.value < day.value ? "Overdue since " + label : "Due " + label
    }
}
