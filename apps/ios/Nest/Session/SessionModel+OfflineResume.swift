import Foundation

extension SessionModel {
    func resumeOfflineWork(calendarAccess: CalendarAccess) async {
        guard offlineReplayReady, case .ready(let member) = status else { return }
        let attempt = generation
        // This can only remove busy sharing; it never enables sharing or publishes device details.
        await refreshCalendarPrivacy(access: calendarAccess)
        guard offlineReplayReady, generation == attempt, status == .ready(member) else { return }
        await refreshToday()
        guard offlineReplayReady, generation == attempt, status == .ready(member), !Task.isCancelled else { return }
        // This existing replay dispatches only durable grocery checks, never saved online-only edits.
        await refreshGroceries()
    }
}
