import Foundation
import XCTest

@testable import NestCore

final class CalendarBusyTimeTests: XCTestCase {
    func testGeneratedCivilDaysCoverLastMillisecondWithoutEnteringNextDay() throws {
        for zone in ["Europe/Zurich", "America/New_York", "Pacific/Apia", "UTC"] {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = try XCTUnwrap(TimeZone(identifier: zone))
            let origin = try XCTUnwrap(calendar.date(from: DateComponents(year: 2011, month: 12, day: 15)))
            for offset in 0..<200 {
                let date = try XCTUnwrap(calendar.date(byAdding: .day, value: offset, to: origin))
                let day = try XCTUnwrap(calendar.dateInterval(of: .day, for: date))
                let next = try XCTUnwrap(calendar.dateInterval(of: .day, for: day.end))
                let expected = BusyInterval(
                    start: Int64(day.start.timeIntervalSince1970 * 1000),
                    end: Int64(day.end.timeIntervalSince1970 * 1000))
                for end in [day.end.addingTimeInterval(-1), day.end] {
                    let interval = try XCTUnwrap(
                        CalendarBusyTime.interval(start: day.start, end: end, allDay: true, calendar: calendar))
                    XCTAssertEqual(interval, expected, zone)
                    let projection = LocalAvailability.project(
                        events: [
                            .init(
                                calendarId: "chosen", interval: interval, free: false, cancelled: false, declined: false
                            )
                        ],
                        selected: ["chosen"], available: ["chosen"], permission: true,
                        covered: .init(start: expected.start, end: Int64(next.end.timeIntervalSince1970 * 1000)))
                    XCTAssertEqual(
                        projection.state(
                            for: .init(start: expected.end - 1, end: expected.end), capturedAt: 100, now: 101,
                            maxAge: 1000),
                        .busy)
                    XCTAssertEqual(
                        projection.state(
                            for: .init(start: expected.end, end: expected.end + 1), capturedAt: 100, now: 101,
                            maxAge: 1000),
                        .free)
                }
            }
        }
    }

    func testZurichDSTAndMultipleDayBoundaries() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Zurich"))
        for (month, date, hours) in [(3, 29, 23), (10, 25, 25)] {
            let start = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: month, day: date)))
            let day = try XCTUnwrap(calendar.dateInterval(of: .day, for: start))
            let interval = try XCTUnwrap(
                CalendarBusyTime.interval(
                    start: day.start, end: day.end.addingTimeInterval(-1), allDay: true, calendar: calendar))
            XCTAssertEqual(interval.end - interval.start, Int64(hours * 3_600_000))
        }
        let start = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 3, day: 27)))
        let end = try XCTUnwrap(calendar.date(byAdding: .day, value: 3, to: start))
        let inclusive = try XCTUnwrap(
            CalendarBusyTime.interval(start: start, end: end.addingTimeInterval(-1), allDay: true, calendar: calendar))
        let exclusive = CalendarBusyTime.interval(start: start, end: end, allDay: true, calendar: calendar)
        XCTAssertEqual(inclusive, exclusive)
        XCTAssertEqual(inclusive.end - inclusive.start, 71 * 3_600_000)
    }

    func testTimedRoundingAndMalformedAllDayDatesFailClosed() {
        XCTAssertEqual(
            CalendarBusyTime.interval(
                start: .init(timeIntervalSince1970: 100.0001), end: .init(timeIntervalSince1970: 200.0001)),
            BusyInterval(start: 100_000, end: 200_001))
        for allDay in [false, true] {
            XCTAssertNil(
                CalendarBusyTime.interval(start: .init(timeIntervalSince1970: .nan), end: .now, allDay: allDay))
            XCTAssertNil(
                CalendarBusyTime.interval(start: .now, end: .init(timeIntervalSince1970: .infinity), allDay: allDay))
            XCTAssertNil(CalendarBusyTime.interval(start: .init(timeIntervalSince1970: -1), end: .now, allDay: allDay))
            XCTAssertNil(CalendarBusyTime.interval(start: .now, end: .distantPast, allDay: allDay))
            let date = Date(timeIntervalSince1970: 100)
            XCTAssertNil(CalendarBusyTime.interval(start: date, end: date, allDay: allDay))
        }
    }
}
