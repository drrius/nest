import Foundation
import XCTest

@testable import Nest

@MainActor
final class CalendarModelTests: XCTestCase {
    func testBackgroundClearingPreservesSelectionAndForegroundReadsChangedLocalEvents() throws {
        let suite = "calendar-foreground-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let storage = CalendarSelectionStore(member: member, defaults: defaults)
        let reader = FakeCalendarReader()
        let model = CalendarModel(reader: reader, selectionStore: storage)
        let day = Date(timeIntervalSince1970: 1_791_331_200)
        model.refresh(day: day)
        model.select("personal", enabled: true, day: day)
        XCTAssertEqual(model.events.first?.title, "Private fixture")

        model.clearVisibleDetails()
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertTrue(model.calendars.isEmpty)
        XCTAssertEqual(storage.read(), ["personal"])
        reader.eventTitle = "Changed while Nest was inactive"
        let previousReads = reader.eventReads

        model.refresh(day: day)
        XCTAssertEqual(reader.eventReads, previousReads + 1)
        XCTAssertEqual(model.events.first?.title, "Changed while Nest was inactive")
        XCTAssertEqual(model.selected, ["personal"])
        XCTAssertEqual(model.calendars.map(\.id), ["personal"])
        XCTAssertEqual(reader.permissionRequests, 0)
    }

    func testTwoScreensRefreshTheLatestSelectionWithoutOverwritingEachOther() throws {
        let suite = "calendar-shared-selection-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let storage = CalendarSelectionStore(member: member, defaults: defaults)
        let reader = FakeCalendarReader()
        let today = CalendarModel(reader: reader, selectionStore: storage)
        let calendar = CalendarModel(reader: reader, selectionStore: storage)
        calendar.refresh(day: .now)
        calendar.select("personal", enabled: true, day: .now)
        today.refresh(day: .now)
        XCTAssertEqual(today.selected, ["personal"])
        XCTAssertEqual(today.events.count, 1)
        calendar.select("personal", enabled: false, day: .now)
        today.refresh(day: .now)
        XCTAssertTrue(today.selected.isEmpty)
        XCTAssertTrue(today.events.isEmpty)
        XCTAssertTrue(storage.read().isEmpty)
    }

    func testSavedSelectionLoadsAndRevocationErasesIt() throws {
        let suite = "calendar-model-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let storage = CalendarSelectionStore(member: member, defaults: defaults)
        let reader = FakeCalendarReader()
        let first = CalendarModel(reader: reader, selectionStore: storage)
        first.refresh(day: .now)
        first.select("personal", enabled: true, day: .now)
        let reopened = CalendarModel(reader: reader, selectionStore: storage)
        reopened.refresh(day: .now)
        XCTAssertEqual(reopened.selected, ["personal"])
        XCTAssertEqual(reopened.events.count, 1)
        reader.access = .denied
        reopened.refresh(day: .now)
        XCTAssertTrue(storage.read().isEmpty)
        XCTAssertTrue(reopened.events.isEmpty)
    }

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
    var eventTitle = "Private fixture"
    var permissionRequests = 0

    func requestAccess() async throws {
        permissionRequests += 1
        access = .denied
    }
    func calendars() -> [DeviceCalendar] { available }
    func events(in interval: DateInterval, calendars: Set<String>) -> [DeviceCalendarEvent] {
        eventReads += 1
        lastSelection = calendars
        lastInterval = interval
        guard calendars.contains("personal") else { return [] }
        return [
            .init(
                id: "fixture", title: eventTitle, calendar: "Personal", start: interval.start,
                end: interval.end, allDay: true, location: nil)
        ]
    }
}
