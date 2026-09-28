import Foundation
import XCTest

@testable import Nest

@MainActor
final class CalendarModelTests: XCTestCase {
    func testSelectionIsExplicitAndRevocationClearsPrivateDetails() {
        let reader = FakeCalendarReader()
        let model = CalendarModel(reader: reader)
        model.refresh(day: .now)
        XCTAssertTrue(model.selected.isEmpty)
        XCTAssertTrue(reader.lastSelection.isEmpty)
        model.select("personal", enabled: true, day: .now)
        XCTAssertEqual(reader.lastSelection, ["personal"])
        XCTAssertEqual(model.events.count, 1)
        reader.access = .denied
        model.refresh(day: .now)
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertTrue(model.calendars.isEmpty)
        XCTAssertTrue(model.selected.isEmpty)
        XCTAssertEqual(model.access, .denied)
    }

    func testMissingCalendarIsRemovedAndDayRangeHandlesDST() throws {
        let reader = FakeCalendarReader()
        let model = CalendarModel(reader: reader)
        model.refresh(day: .now)
        model.select("personal", enabled: true, day: .now)
        reader.available = []
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Europe/Zurich"))
        let day = try XCTUnwrap(calendar.date(from: DateComponents(year: 2026, month: 3, day: 29)))
        model.refresh(day: day, calendar: calendar)
        XCTAssertTrue(model.selected.isEmpty)
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertEqual(reader.lastInterval?.duration, 23 * 60 * 60)
    }

    func testDeniedRequestDoesNotReadEvents() async {
        let reader = FakeCalendarReader()
        reader.access = .notRequested
        let model = CalendarModel(reader: reader)
        await model.requestAccess(day: .now)
        XCTAssertEqual(model.access, .denied)
        XCTAssertEqual(reader.eventReads, 0)
        XCTAssertFalse(model.requesting)
    }
}

@MainActor
private final class FakeCalendarReader: DeviceCalendarReading {
    var access: CalendarAccess = .allowed
    var available = [DeviceCalendar(id: "personal", title: "Personal", source: "Test")]
    var lastSelection: Set<String> = []
    var lastInterval: DateInterval?
    var eventReads = 0

    func requestAccess() async throws { access = .denied }
    func calendars() -> [DeviceCalendar] { available }
    func events(in interval: DateInterval, calendars: Set<String>) -> [DeviceCalendarEvent] {
        eventReads += 1
        lastSelection = calendars
        lastInterval = interval
        guard calendars.contains("personal") else { return [] }
        return [
            .init(
                id: "fixture", title: "Private fixture", calendar: "Personal", start: interval.start,
                end: interval.end, allDay: true, location: nil)
        ]
    }
}
