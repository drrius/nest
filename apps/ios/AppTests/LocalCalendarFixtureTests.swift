import EventKit
import Foundation
import XCTest

@testable import Nest

/// Explicit local QA only: never creates events on a phone or an arbitrary simulator.
@MainActor
final class LocalCalendarFixtureTests: XCTestCase {
    private var markerURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("nest.test.local-calendar-fixture.v1.json")
    }
    private let titlePrefix = "Nest synthetic QA "

    func testSeedOwnedCalendarAndVerifyRealReads() throws {
        try requireFixtureAction("seed")
        let store = EKEventStore()
        guard !FileManager.default.fileExists(atPath: markerURL.path) else {
            throw FixtureError.existingFixture
        }
        let calendar = try makeCalendar(in: store)
        do {
            let day = try XCTUnwrap(Calendar.current.dateInterval(of: .day, for: .now))
            let manifest = Manifest(id: calendar.calendarIdentifier, title: calendar.title, day: day)
            try seedEvents(in: calendar, store: store, day: day)
            try FileManager.default.createDirectory(
                at: markerURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(manifest).write(to: markerURL, options: .atomic)
            try verifyReads(manifest)
        } catch {
            try store.removeCalendar(calendar, commit: true)
            if FileManager.default.fileExists(atPath: markerURL.path) {
                try FileManager.default.removeItem(at: markerURL)
            }
            throw error
        }
    }

    func testRemoveOnlyOwnedCalendarFixture() throws {
        try requireFixtureAction("cleanup")
        let data = try Data(contentsOf: markerURL)
        let manifest = try JSONDecoder().decode(Manifest.self, from: data)
        let store = EKEventStore()
        let calendar = try XCTUnwrap(store.calendar(withIdentifier: manifest.id))
        guard calendar.title == manifest.title, calendar.title.hasPrefix(titlePrefix),
            calendar.source.sourceType == .local
        else { throw FixtureError.ownershipMismatch }
        try store.removeCalendar(calendar, commit: true)
        XCTAssertFalse(EventKitCalendarReader().calendars().contains { $0.id == manifest.id })
        try FileManager.default.removeItem(at: markerURL)
        XCTAssertFalse(FileManager.default.fileExists(atPath: markerURL.path))
    }

    private func requireFixtureAction(_ action: String) throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_CALENDAR_FIXTURE_ACTION"] == action else {
                throw XCTSkip("Requires an explicit local Calendar fixture action.")
            }
            guard environment["SIMULATOR_UDID"] == "EE945B62-C56C-4AB9-A09E-C4B44F9CF03C",
                Bundle.main.object(forInfoDictionaryKey: "NEST_API_URL") as? String
                    == "https://nest-test-api-drrius-projects.vercel.app",
                EKEventStore.authorizationStatus(for: .event) == .fullAccess
            else { throw FixtureError.environmentMismatch }
        #else
            throw XCTSkip("Local Calendar fixtures are forbidden on physical devices.")
        #endif
    }

    private func makeCalendar(in store: EKEventStore) throws -> EKCalendar {
        let source = try XCTUnwrap(store.sources.first { $0.sourceType == .local })
        let calendar = EKCalendar(for: .event, eventStore: store)
        calendar.source = source
        calendar.title = titlePrefix + UUID().uuidString
        try store.saveCalendar(calendar, commit: true)
        return calendar
    }

    private func seedEvents(in calendar: EKCalendar, store: EKEventStore, day: DateInterval) throws {
        let allDay = EKEvent(eventStore: store)
        allDay.calendar = calendar
        allDay.title = "Synthetic Nest all-day task"
        allDay.isAllDay = true
        allDay.startDate = day.start
        allDay.endDate = day.end
        allDay.location = "Fictional all-day location"
        allDay.notes = "Synthetic local QA only; never share this note."
        try store.save(allDay, span: .thisEvent, commit: true)
        let timed = EKEvent(eventStore: store)
        timed.calendar = calendar
        timed.title = "Synthetic Nest timed visit"
        timed.startDate = try XCTUnwrap(Calendar.current.date(bySettingHour: 18, minute: 0, second: 0, of: day.start))
        timed.endDate = try XCTUnwrap(Calendar.current.date(byAdding: .hour, value: 1, to: timed.startDate))
        timed.location = "Fictional timed location"
        timed.url = URL(string: "https://example.invalid/nest-synthetic-only")
        try store.save(timed, span: .thisEvent, commit: true)
    }

    private func verifyReads(_ manifest: Manifest) throws {
        let reader = EventKitCalendarReader()
        let selected: Set<String> = [manifest.id]
        let events = reader.events(in: manifest.day, calendars: selected)
        XCTAssertEqual(events.count, 2)
        XCTAssertEqual(Set(events.map(\.title)), ["Synthetic Nest all-day task", "Synthetic Nest timed visit"])
        XCTAssertEqual(events.filter(\.allDay).count, 1)
        XCTAssertTrue(events.allSatisfy { $0.calendar == manifest.title && $0.location != nil })
        let covered = try XCTUnwrap(EventKitBusyMapping.interval(start: manifest.day.start, end: manifest.day.end))
        guard case .known(let projection) = reader.captureBusy(selected: selected, covered: covered) else {
            return XCTFail("Real EventKit fixture capture must have known coverage.")
        }
        XCTAssertEqual(try projection.validated(), BusyProjection(covered: covered, intervals: [covered]))
        let payload = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(projection)) as? [String: Any])
        XCTAssertEqual(Set(payload.keys), ["covered", "intervals"])
        let intervals = try XCTUnwrap(payload["intervals"] as? [[String: Any]])
        XCTAssertEqual(intervals.count, 1)
        XCTAssertTrue(intervals.allSatisfy { Set($0.keys) == ["start", "end"] })
        let bounds = try XCTUnwrap(payload["covered"] as? [String: Any])
        XCTAssertEqual(Set(bounds.keys), ["start", "end"])
    }

    private struct Manifest: Codable {
        let id: String
        let title: String
        let day: DateInterval
    }

    private enum FixtureError: Error {
        case existingFixture, environmentMismatch, ownershipMismatch
    }
}
