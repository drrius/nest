import EventKit
import Foundation

@MainActor
enum EventKitBusyMapping {
    static func event(_ event: EKEvent) -> BusyEvent? {
        guard let start = event.startDate, let end = event.endDate,
            let interval = interval(start: start, end: end), let calendar = event.calendar
        else { return nil }
        return BusyEvent(
            calendarId: calendar.calendarIdentifier, interval: interval,
            free: event.availability == .free, cancelled: event.status == .canceled,
            declined: event.attendees?.contains(where: { $0.isCurrentUser && $0.participantStatus == .declined })
                == true)
    }

    static func interval(start: Date, end: Date) -> BusyInterval? {
        let first = start.timeIntervalSince1970 * 1000
        let last = end.timeIntervalSince1970 * 1000
        guard first.isFinite, last.isFinite, first >= 0, last <= 253_402_300_799_999, first < last else { return nil }
        return BusyInterval(start: Int64(first.rounded(.down)), end: Int64(last.rounded(.up)))
    }
}
