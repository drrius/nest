import EventKit
import Foundation
import XCTest

@testable import Nest

@MainActor
final class EventKitPermissionRevocationTests: XCTestCase {
    private let suite = "nest-owned-eventkit-revocation-20261007"
    private let title = "Nest synthetic permission revocation"
    private let member = VerifiedMember(
        userId: UUID(uuidString: "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA")!,
        householdId: UUID(uuidString: "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB")!, displayName: "Synthetic")

    func testReadOwnedEventAndPersistSelectionBeforeRevocation() throws {
        try requirePhase("allowed")
        XCTAssertEqual(EKEventStore.authorizationStatus(for: .event), .fullAccess)
        let store = EKEventStore()
        let day = try XCTUnwrap(Calendar.current.dateInterval(of: .day, for: .now))
        let predicate = store.predicateForEvents(withStart: day.start, end: day.end, calendars: nil)
        XCTAssertTrue(store.events(matching: predicate).isEmpty, "Only an empty owned simulator may be seeded")
        let source = try XCTUnwrap(store.sources.first { $0.sourceType == .local })
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = title
        calendar.source = source
        try store.saveCalendar(calendar, commit: true)
        let event = EKEvent(eventStore: store)
        event.calendar = calendar
        event.title = "Synthetic local event"
        event.startDate = day.start.addingTimeInterval(3600)
        event.endDate = day.start.addingTimeInterval(7200)
        try store.save(event, span: .thisEvent, commit: true)
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        XCTAssertNil(defaults.string(forKey: "calendar"), "Do not overwrite an earlier fixture")
        let selection = CalendarSelectionStore(member: member, defaults: defaults)
        let model = CalendarModel(reader: EventKitCalendarReader(), selectionStore: selection)
        model.refresh(day: day.start)
        model.select(calendar.calendarIdentifier, enabled: true, day: day.start)
        XCTAssertEqual(model.events.map(\.title), ["Synthetic local event"])
        XCTAssertEqual(selection.read(), [calendar.calendarIdentifier])
        defaults.set(calendar.calendarIdentifier, forKey: "calendar")
        defaults.set(day.start.timeIntervalSince1970, forKey: "day")
        XCTAssertTrue(defaults.synchronize(), "Flush the test marker before the external permission change")
    }

    func testDeniedEventKitReadClearsPersistedSelectionAfterRestart() throws {
        try requirePhase("denied")
        XCTAssertEqual(EKEventStore.authorizationStatus(for: .event), .denied)
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        let id = try XCTUnwrap(defaults.string(forKey: "calendar"))
        let day = Date(timeIntervalSince1970: defaults.double(forKey: "day"))
        let selection = CalendarSelectionStore(member: member, defaults: defaults)
        XCTAssertEqual(selection.read(), [id], "The same fixture must survive the test-host restart")
        let reader = EventKitCalendarReader()
        let model = CalendarModel(reader: reader, selectionStore: selection)
        model.refresh(day: day)
        XCTAssertEqual(model.access, .denied)
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertTrue(model.calendars.isEmpty)
        XCTAssertTrue(model.selected.isEmpty)
        XCTAssertTrue(selection.read().isEmpty)
        let interval = try XCTUnwrap(Calendar.current.dateInterval(of: .day, for: day))
        XCTAssertTrue(reader.events(in: interval, calendars: [id]).isEmpty)
        let covered = try XCTUnwrap(EventKitBusyMapping.interval(start: interval.start, end: interval.end))
        XCTAssertEqual(reader.captureBusy(selected: [id], covered: covered), .unknown)
        defaults.removePersistentDomain(forName: suite)
    }

    private func requirePhase(_ phase: String) throws {
        continueAfterFailure = false
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_EVENTKIT_PHASE"] == phase else {
                throw XCTSkip("Requires the owned empty simulator permission-revocation runner")
            }
            let simulator = try XCTUnwrap(env["NEST_QA_EVENTKIT_SIMULATOR"])
            let originalSimulators =
                [
                    "EE945B62-C56C-4AB9-A09E-C4B44F9CF03C", "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A",
                    "CA0BCEDE-A297-493A-8921-9E31F8B65783", "32A0B927-94F3-4285-8BA4-D4C5749C6214",
                ]
            guard env["SIMULATOR_UDID"] == simulator, UUID(uuidString: simulator) != nil,
                !originalSimulators.contains(simulator),
                env["NEST_QA_EVENTKIT_CREATED"] == "20261007-empty-no-account"
            else { throw XCTSkip("Permission fixture requires a new owned simulator") }
        #else
            throw XCTSkip("Synthetic event creation is forbidden on physical phones")
        #endif
    }
}
