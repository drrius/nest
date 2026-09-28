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
}
