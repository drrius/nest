import EventKit
import Foundation
import XCTest

@testable import Nest

@MainActor
final class EventKitForegroundRefreshTests: XCTestCase {
    func testForegroundRefreshReadsExternalEventChangeAfterClearingPrivateDetails() async throws {
        try requireOwnedSimulator()
        XCTAssertEqual(EKEventStore.authorizationStatus(for: .event), .fullAccess)
        let writer = EKEventStore()
        let day = try XCTUnwrap(Calendar.current.dateInterval(of: .day, for: .now))
        let predicate = writer.predicateForEvents(withStart: day.start, end: day.end, calendars: nil)
        XCTAssertTrue(writer.events(matching: predicate).isEmpty, "Only an empty owned simulator may be seeded")
        let calendar = try makeOwnedCalendar(writer)
        let id = calendar.calendarIdentifier
        let title = try XCTUnwrap(calendar.title)
        let suite = "nest-owned-eventkit-foreground-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer {
            defaults.removePersistentDomain(forName: suite)
            do { try removeOwnedCalendar(id: id, title: title) } catch {
                XCTFail("Could not remove owned synthetic calendar: \(error)")
            }
        }
        let event = EKEvent(eventStore: writer)
        event.calendar = calendar
        event.title = "Synthetic initial event"
        event.location = "Fictional initial location"
        event.startDate = day.start.addingTimeInterval(3600)
        event.endDate = day.start.addingTimeInterval(7200)
        try writer.save(event, span: .thisEvent, commit: true)
        let eventID = try XCTUnwrap(event.eventIdentifier)
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Synthetic")
        let selection = CalendarSelectionStore(member: member, defaults: defaults)
        let model = CalendarModel(reader: EventKitCalendarReader(), selectionStore: selection)
        model.refresh(day: day.start)
        model.select(id, enabled: true, day: day.start)
        XCTAssertEqual(model.events.map(\.title), ["Synthetic initial event"])
        XCTAssertEqual(model.events.first?.location, "Fictional initial location")

        model.clearVisibleDetails()
        XCTAssertTrue(model.events.isEmpty)
        XCTAssertTrue(model.calendars.isEmpty)
        XCTAssertEqual(selection.read(), [id])
        let changed = expectation(forNotification: .EKEventStoreChanged, object: nil)
        let editor = EKEventStore()
        let edited = try XCTUnwrap(editor.event(withIdentifier: eventID))
        XCTAssertEqual(edited.calendar.calendarIdentifier, id)
        edited.title = "Synthetic externally changed event"
        edited.location = "Fictional changed location"
        let start = day.start.addingTimeInterval(10800)
        let end = day.start.addingTimeInterval(14400)
        edited.startDate = start
        edited.endDate = end
        try editor.save(edited, span: .thisEvent, commit: true)
        await fulfillment(of: [changed], timeout: 5)
        XCTAssertTrue(model.events.isEmpty, "An external update must not expose details while inactive")
        model.refresh(day: day.start)
        XCTAssertEqual(model.events.map(\.title), ["Synthetic externally changed event"])
        XCTAssertEqual(model.events.first?.start, start)
        XCTAssertEqual(model.events.first?.end, end)
        XCTAssertEqual(model.events.first?.location, "Fictional changed location")
        XCTAssertEqual(model.selected, [id])
        XCTAssertEqual(selection.read(), [id])
    }

    private func makeOwnedCalendar(_ store: EKEventStore) throws -> EKCalendar {
        let source = try XCTUnwrap(store.sources.first { $0.sourceType == .local })
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.title = "Nest synthetic foreground \(UUID())"
        calendar.source = source
        try store.saveCalendar(calendar, commit: true)
        return calendar
    }

    private func removeOwnedCalendar(id: String, title: String) throws {
        let store = EKEventStore()
        let calendar = try XCTUnwrap(store.calendar(withIdentifier: id))
        guard calendar.title == title, calendar.title.hasPrefix("Nest synthetic foreground "),
            calendar.source.sourceType == .local
        else { throw FixtureError.ownershipMismatch }
        try store.removeCalendar(calendar, commit: true)
        XCTAssertNil(store.calendar(withIdentifier: id))
    }

    private func requireOwnedSimulator() throws {
        continueAfterFailure = false
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_EVENTKIT_PHASE"] == "foreground" else {
                throw XCTSkip("Requires the owned empty simulator foreground refresh runner")
            }
            let simulator = try XCTUnwrap(env["NEST_QA_EVENTKIT_SIMULATOR"])
            let originals = [
                "EE945B62-C56C-4AB9-A09E-C4B44F9CF03C", "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783", "32A0B927-94F3-4285-8BA4-D4C5749C6214",
            ]
            guard env["SIMULATOR_UDID"] == simulator, UUID(uuidString: simulator) != nil,
                !originals.contains(simulator), env["NEST_QA_EVENTKIT_CREATED"] == "20261007-empty-no-account"
            else { throw XCTSkip("Foreground fixture requires a new owned simulator") }
        #else
            throw XCTSkip("Synthetic event creation is forbidden on physical phones")
        #endif
    }

    private enum FixtureError: Error { case ownershipMismatch }
}
