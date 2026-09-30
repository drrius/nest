import EventKit
import Foundation

@MainActor
enum EventKitBusyMapping {
    static func event(_ event: EKEvent) -> BusyEvent? {
        guard let start = event.startDate, let end = event.endDate,
            let interval = CalendarBusyTime.interval(start: start, end: end, allDay: event.isAllDay),
            let calendar = event.calendar
        else { return nil }
        return BusyEvent(
            calendarId: calendar.calendarIdentifier, interval: interval,
            free: event.availability == .free, cancelled: event.status == .canceled,
            declined: event.attendees?.contains(where: { $0.isCurrentUser && $0.participantStatus == .declined })
                == true)
    }

    static func interval(start: Date, end: Date) -> BusyInterval? {
        CalendarBusyTime.interval(start: start, end: end)
    }
}
