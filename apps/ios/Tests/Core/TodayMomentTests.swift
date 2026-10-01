import Foundation
import XCTest

@testable import NestCore

final class TodayMomentTests: XCTestCase {
    private let locale = Locale(identifier: "en_GB")

    private func instant(_ value: String) throws -> Date {
        try XCTUnwrap(ISO8601DateFormatter().date(from: value))
    }

    func testMidnightMovesHeaderMealsAndChoreVisibilityToTheSameDay() throws {
        let zone = try XCTUnwrap(TimeZone(identifier: "Europe/Zurich"))
        let before = try TodayMoment(now: instant("2026-09-30T21:59:59Z"), timeZone: zone, locale: locale)
        let after = try TodayMoment(now: instant("2026-09-30T22:00:00Z"), timeZone: zone, locale: locale)
        XCTAssertEqual(before.day.value, "2026-09-30")
        XCTAssertEqual(after.day.value, "2026-10-01")
        XCTAssertTrue(before.header.contains("30 September"))
        XCTAssertTrue(after.header.contains("1 October"))
        let today = try CivilDate("2026-09-30")
        let tomorrow = try CivilDate("2026-10-01")
        XCTAssertEqual(before.dueLabel(today), "Due today")
        XCTAssertEqual(after.dueLabel(today), "Overdue since 30 Sept")
        XCTAssertEqual(before.dueLabel(tomorrow), "Due 1 Oct")
        XCTAssertEqual(after.dueLabel(tomorrow), "Due today")
        let actor = UUID()
        let chore = LocalChore(
            chore: NestChore(
                occurrenceId: UUID(), title: "Tomorrow's chore", dueDate: tomorrow,
                assigneeId: actor, offlineEpoch: nil),
            state: .open, operationId: nil)
        XCTAssertFalse(chore.visibleToday(on: before.day, actor: actor, everyone: false))
        XCTAssertTrue(chore.visibleToday(on: after.day, actor: actor, everyone: false))
    }

    func testTravelAndSkippedLocalDayDoNotShiftCivilDateLabels() throws {
        let now = try instant("2026-09-30T22:30:00Z")
        let zurich = try TodayMoment(
            now: now, timeZone: XCTUnwrap(TimeZone(identifier: "Europe/Zurich")), locale: locale)
        let newYork = try TodayMoment(
            now: now, timeZone: XCTUnwrap(TimeZone(identifier: "America/New_York")), locale: locale)
        XCTAssertEqual(zurich.day.value, "2026-10-01")
        XCTAssertEqual(newYork.day.value, "2026-09-30")
        XCTAssertTrue(zurich.header.contains("1 October"))
        XCTAssertTrue(newYork.header.contains("30 September"))
        let apia = try XCTUnwrap(TimeZone(identifier: "Pacific/Apia"))
        let skipped = try CivilDate("2011-12-30")
        XCTAssertNil(skipped.localDay(timeZone: apia))
        let afterSkip = try TodayMoment(now: instant("2011-12-30T20:00:00Z"), timeZone: apia, locale: locale)
        XCTAssertEqual(afterSkip.day.value, "2011-12-31")
        XCTAssertEqual(afterSkip.dueLabel(skipped), "Overdue since 30 Dec")
    }

    func testGeneratedDeviceDaysAndOverdueClassificationAcrossDstAndYearBoundary() throws {
        let start = try instant("2026-01-01T22:30:00Z")
        for identifier in ["Europe/Zurich", "America/New_York", "Pacific/Kiritimati", "Pacific/Apia"] {
            let zone = try XCTUnwrap(TimeZone(identifier: identifier))
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            for offset in 0..<370 {
                let now = start.addingTimeInterval(Double(offset) * 86_400)
                let moment = try TodayMoment(now: now, timeZone: zone, locale: locale)
                let fields = calendar.dateComponents([.year, .month, .day], from: now)
                let expected = String(format: "%04d-%02d-%02d", fields.year!, fields.month!, fields.day!)
                XCTAssertEqual(moment.day.value, expected, identifier)
                let previous = try XCTUnwrap(calendar.date(byAdding: .day, value: -1, to: now))
                let prior = calendar.dateComponents([.year, .month, .day], from: previous)
                let due = try CivilDate(String(format: "%04d-%02d-%02d", prior.year!, prior.month!, prior.day!))
                XCTAssertTrue(moment.dueLabel(due).hasPrefix("Overdue since "), identifier)
            }
        }
    }

    func testInvalidClockCannotProduceAFalseCurrentDay() throws {
        for value in [Double.nan, Double.infinity, -Double.infinity] {
            XCTAssertThrowsError(try TodayMoment(now: Date(timeIntervalSince1970: value)))
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let beforeEra = try XCTUnwrap(calendar.date(from: DateComponents(era: 0, year: 1, month: 1, day: 1)))
        XCTAssertThrowsError(try TodayMoment(now: beforeEra, timeZone: calendar.timeZone))
        let outside = try XCTUnwrap(calendar.date(from: DateComponents(year: 10000, month: 1, day: 1)))
        XCTAssertThrowsError(try TodayMoment(now: outside, timeZone: calendar.timeZone))
    }
}
