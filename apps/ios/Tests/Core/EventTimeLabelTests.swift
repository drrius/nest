import XCTest

@testable import NestCore

final class EventTimeLabelTests: XCTestCase {
    private var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(identifier: "Europe/Zurich")!
        return value
    }

    private func date(_ day: Int, _ hour: Int) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour))!
    }

    func testSameDayShowsTheTimeAndOtherDaysAddTheDate() {
        let locale = Locale(identifier: "en_GB")
        let today = date(10, 12)
        XCTAssertEqual(
            EventTimeLabel.parts(date(10, 22), on: today, calendar: calendar, locale: locale),
            EventTimeLabel.Parts(day: nil, time: "22:00"))
        let tomorrow = EventTimeLabel.parts(date(11, 1), on: today, calendar: calendar, locale: locale)
        XCTAssertEqual(tomorrow.time, "01:00")
        XCTAssertEqual(tomorrow.day, "11 Oct")
        XCTAssertEqual(EventTimeLabel.parts(date(9, 23), on: today, calendar: calendar, locale: locale).day, "9 Oct")
    }
}
