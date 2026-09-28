import Foundation

struct DeviceCalendar: Identifiable, Equatable {
    let id: String
    let title: String
    let source: String
}

struct DeviceCalendarEvent: Identifiable, Equatable {
    let id: String
    let title: String
    let calendar: String
    let start: Date
    let end: Date
    let allDay: Bool
    let location: String?
}

enum CalendarAccess: Equatable {
    case notRequested, allowed, denied, restricted
}

@MainActor
protocol DeviceCalendarReading {
    var access: CalendarAccess { get }
    func requestAccess() async throws
    func calendars() -> [DeviceCalendar]
    func events(in interval: DateInterval, calendars: Set<String>) -> [DeviceCalendarEvent]
}
