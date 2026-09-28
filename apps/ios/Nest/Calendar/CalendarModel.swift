import Combine
import Foundation

@MainActor
final class CalendarModel: ObservableObject {
    @Published private(set) var access: CalendarAccess = .notRequested
    @Published private(set) var calendars: [DeviceCalendar] = []
    @Published private(set) var events: [DeviceCalendarEvent] = []
    @Published private(set) var selected: Set<String> = []
    @Published private(set) var requesting = false
    @Published private(set) var notice: String?
    private let selectionStore: CalendarSelectionStore?
    private let reader: any DeviceCalendarReading

    init(
        reader: any DeviceCalendarReading = EventKitCalendarReader(),
        selectionStore: CalendarSelectionStore? = nil
    ) {
        self.reader = reader
        self.selectionStore = selectionStore
        selected = selectionStore?.read() ?? []
    }

    func requestAccess(day: Date) async {
        guard !requesting else { return }
        requesting = true
        defer { requesting = false }
        do {
            try await reader.requestAccess()
            notice = nil
        } catch {
            notice = "Calendar access could not be requested. Try again."
        }
        refresh(day: day)
    }

    func select(_ id: String, enabled: Bool, day: Date) {
        guard calendars.contains(where: { $0.id == id }) else { return }
        if enabled { selected.insert(id) } else { selected.remove(id) }
        refresh(day: day)
    }

    func clearVisibleDetails() {
        events = []
        calendars = []
    }

    func refresh(day: Date, calendar: Calendar = .current) {
        access = reader.access
        guard access == .allowed else {
            clearVisibleDetails()
            selected = []
            selectionStore?.save([])
            return
        }
        calendars = reader.calendars()
        selected.formIntersection(calendars.map(\.id))
        selectionStore?.save(selected)
        guard let interval = calendar.dateInterval(of: .day, for: day) else {
            events = []
            notice = "This date could not be loaded. Choose another day."
            return
        }
        events = reader.events(in: interval, calendars: selected)
    }
}
