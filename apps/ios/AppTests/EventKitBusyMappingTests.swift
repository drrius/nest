import EventKit
import XCTest

@testable import Nest

@MainActor
final class EventKitBusyMappingTests: XCTestCase {
    func testUnsavedEventMappingKeepsOnlyTimingAndBlockingFlags() throws {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.calendar = EKCalendar(for: .event, eventStore: store)
        event.title = "PRIVATE TITLE MUST NOT TRANSFER"
        event.location = "PRIVATE LOCATION"
        event.notes = "PRIVATE NOTES"
        event.startDate = Date(timeIntervalSince1970: 100.0001)
        event.endDate = Date(timeIntervalSince1970: 200.0001)
        event.availability = .free
        let mapped = try XCTUnwrap(EventKitBusyMapping.event(event))
        XCTAssertEqual(mapped.interval, BusyInterval(start: 100_000, end: 200_000))
        XCTAssertEqual(event.availability, .notSupported)
        XCTAssertFalse(mapped.free)
        XCTAssertFalse(mapped.cancelled)
        XCTAssertFalse(mapped.declined)
        event.availability = .busy
        XCTAssertFalse(try XCTUnwrap(EventKitBusyMapping.event(event)).free)
    }

    func testMalformedDatesFailClosedWithoutIntegerConversionTrap() {
        XCTAssertEqual(
            EventKitBusyMapping.interval(
                start: .init(timeIntervalSince1970: 100.0001), end: .init(timeIntervalSince1970: 200.0001)),
            BusyInterval(start: 100_000, end: 200_001))
        XCTAssertNil(EventKitBusyMapping.interval(start: .init(timeIntervalSince1970: .nan), end: .now))
        XCTAssertNil(EventKitBusyMapping.interval(start: .now, end: .init(timeIntervalSince1970: .infinity)))
        XCTAssertNil(EventKitBusyMapping.interval(start: .init(timeIntervalSince1970: -1), end: .now))
        XCTAssertNil(EventKitBusyMapping.interval(start: .now, end: .distantPast))
    }
}
