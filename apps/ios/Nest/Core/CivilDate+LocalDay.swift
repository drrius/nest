import Foundation

extension CivilDate {
    /// Noon avoids midnight clock changes; the civil date stays in the device's time zone.
    func localDay(timeZone: TimeZone = .current) -> Date? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        let components = DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12)
        guard let date = calendar.date(from: components),
            calendar.dateComponents([.year, .month, .day, .hour], from: date) == components
        else { return nil }
        return date
    }
}
