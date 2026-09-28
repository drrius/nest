import EventKit
import Foundation

@MainActor
final class EventKitCalendarReader: DeviceCalendarReading {
    private let store = EKEventStore()

    var access: CalendarAccess {
        switch EKEventStore.authorizationStatus(for: .event) {
        case .fullAccess: .allowed
        case .notDetermined, .writeOnly: .notRequested
        case .restricted: .restricted
        default: .denied
        }
    }

    func requestAccess() async throws {
        _ = try await store.requestFullAccessToEvents()
        store.reset()
    }

    func calendars() -> [DeviceCalendar] {
        guard access == .allowed else { return [] }
        return store.calendars(for: .event).map {
            DeviceCalendar(id: $0.calendarIdentifier, title: $0.title, source: $0.source.title)
        }.sorted { $0.title.localizedStandardCompare($1.title) == .orderedAscending }
    }

    func events(in interval: DateInterval, calendars selected: Set<String>) -> [DeviceCalendarEvent] {
        guard access == .allowed, !selected.isEmpty else { return [] }
        let calendars = store.calendars(for: .event).filter { selected.contains($0.calendarIdentifier) }
        guard !calendars.isEmpty else { return [] }
        let predicate = store.predicateForEvents(withStart: interval.start, end: interval.end, calendars: calendars)
        return store.events(matching: predicate).filter {
            $0.status != .canceled && $0.startDate < interval.end && $0.endDate > interval.start
        }.map {
            DeviceCalendarEvent(
                id: "\($0.calendarItemIdentifier):\($0.startDate.timeIntervalSince1970)",
                title: $0.title ?? "Untitled event", calendar: $0.calendar.title,
                start: $0.startDate, end: $0.endDate, allDay: $0.isAllDay, location: $0.location)
        }.sorted { $0.start < $1.start }
    }

    /// Call only with separately opted-in calendars; display selection is not sharing consent.
    func captureBusy(selected: Set<String>, covered: BusyInterval) -> LocalAvailability {
        guard access == .allowed, !selected.isEmpty, covered.valid,
            covered.end - covered.start <= 2_678_400_000
        else { return .unknown }
        let available = store.calendars(for: .event)
        let identifiers = Set(available.map(\.calendarIdentifier))
        guard selected.isSubset(of: identifiers) else { return .unknown }
        let calendars = available.filter { selected.contains($0.calendarIdentifier) }
        let start = Date(timeIntervalSince1970: Double(covered.start) / 1000)
        let end = Date(timeIntervalSince1970: Double(covered.end) / 1000)
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        let raw = store.events(matching: predicate)
        let events = raw.compactMap(EventKitBusyMapping.event)
        guard events.count == raw.count, access == .allowed else { return .unknown }
        return .project(events: events, selected: selected, available: identifiers, permission: true, covered: covered)
    }

}
