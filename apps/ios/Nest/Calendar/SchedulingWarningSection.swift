import EventKit
import SwiftUI

/// A day-level warning only: chores have dates, not invented appointment times.
struct SchedulingWarningSection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @Environment(\.scenePhase) private var scenePhase
    @State private var local: BusyState = .unknown
    @State private var snapshots: BusySnapshotsEnvelope?
    @State private var actor: UUID?
    @State private var loading = false
    @State private var requestId = UUID()

    var body: some View {
        Section("Calendar check") {
            Text(message(local, partner: false))
            TimelineView(.periodic(from: .now, by: 30)) { timeline in
                Text(message(partnerState(now: timeline.date), partner: true))
            }
            Text("This is a day-level check of selected calendars. You can still save this date.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
            Button("Refresh availability") { Task { await refresh() } }.disabled(loading)
        }
        .task(id: day) { await refresh() }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Task { await refresh() }
            } else {
                local = .unknown
                snapshots = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            if scenePhase == .active { Task { await refresh() } }
        }
    }

    private var interval: BusyInterval? {
        guard let window = Calendar.current.dateInterval(of: .day, for: day) else { return nil }
        return EventKitBusyMapping.interval(start: window.start, end: window.end)
    }

    private func partnerState(now: Date) -> BusyState {
        guard let interval, let actor,
            let partner = snapshots?.snapshots.first(where: { $0.actorId != actor })
        else { return .unknown }
        return partner.state(for: interval, now: now)
    }

    private func message(_ state: BusyState, partner: Bool) -> String {
        switch state {
        case .busy:
            return partner
                ? "Your partner has shared busy time on this day." : "You have calendar commitments on this day."
        case .free:
            return partner
                ? "No busy time in your partner’s shared calendars for this day."
                : "No busy time in your selected calendars for this day."
        case .unknown:
            return partner ? "Your partner’s availability is unknown." : "Your calendar availability is unknown."
        }
    }

    private func refresh() async {
        let request = UUID()
        requestId = request
        local = .unknown
        snapshots = nil
        loading = true
        defer { if requestId == request { loading = false } }
        do {
            let context = try await session.calendarConsentContext()
            try Task.checkCancellation()
            guard requestId == request, let interval, scenePhase == .active else { return }
            actor = context.member.userId
            let selected = CalendarSelectionStore(member: context.member).read()
            let projection = EventKitCalendarReader().captureBusy(selected: selected, covered: interval)
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            local = projection.state(for: interval, capturedAt: now, now: now, maxAge: 1)
            let value = try await session.readBusySnapshots(context)
            try Task.checkCancellation()
            guard requestId == request, scenePhase == .active else { return }
            snapshots = value
        } catch { if requestId == request { snapshots = nil } }
    }
}
