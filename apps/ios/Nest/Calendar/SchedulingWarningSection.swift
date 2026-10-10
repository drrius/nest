import EventKit
import SwiftUI

/// A day-level warning only: chores have dates, not invented appointment times.
struct SchedulingWarningSection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @Environment(\.scenePhase) private var scenePhase
    @State private var availability = SchedulingAvailability()
    @State private var actor: UUID?

    @Environment(\.memberPalette) private var palette
    var plain = false

    var body: some View {
        TimelineView(.periodic(from: .now, by: 30)) { timeline in
            let hint = hint(now: timeline.date)
            if plain {
                hintRow(hint)
            } else if hint != nil {
                Section { hintRow(hint) }
            }
        }
        .task(id: day) { await refresh() }
        .onDisappear { availability.clear() }
        .onChange(of: scenePhase) {
            if scenePhase == .active {
                Task { await refresh() }
            } else {
                availability.clear()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            if scenePhase == .active { Task { await refresh() } }
        }
    }

    /// One calm line about the selected and shared calendars only, never a claim that someone is free.
    private func hint(now: Date) -> (text: String, busy: Bool)? {
        let mine = availability.local
        let theirs = partnerState(now: now)
        let partner = palette.partnerName
        switch (mine, theirs) {
        case (.busy, .busy): return ("You both have plans that day", true)
        case (.busy, _): return ("You have plans that day", true)
        case (_, .busy): return ("\(partner.capitalizedFirst) has busy time that day", true)
        case (.free, .free): return ("No busy time on either of your shared calendars", false)
        case (.free, .unknown): return ("No busy time on your selected calendars", false)
        default: return nil
        }
    }

    @ViewBuilder
    private func hintRow(_ hint: (text: String, busy: Bool)?) -> some View {
        if let hint {
            Label(hint.text, systemImage: hint.busy ? "calendar.badge.exclamationmark" : "calendar.badge.checkmark")
                .font(.footnote)
                .foregroundStyle(hint.busy ? NestColor.warn : NestColor.good)
                .accessibilityHint("Based on selected calendars only. You can still save this date.")
        }
    }

    private var interval: BusyInterval? {
        guard let window = Calendar.current.dateInterval(of: .day, for: day) else { return nil }
        return EventKitBusyMapping.interval(start: window.start, end: window.end)
    }

    private func partnerState(now: Date) -> BusyState {
        guard let interval, let actor,
            let partner = availability.snapshots?.snapshots.first(where: { $0.actorId != actor })
        else { return .unknown }
        return partner.state(for: interval, now: now)
    }

    private func refresh() async {
        let request = availability.begin()
        defer { availability.finish(request) }
        do {
            let context = try await session.calendarConsentContext()
            try Task.checkCancellation()
            guard availability.isCurrent(request), let interval, scenePhase == .active else { return }
            actor = context.member.userId
            let selected = CalendarSelectionStore(member: context.member).read()
            let projection = EventKitCalendarReader().captureBusy(selected: selected, covered: interval)
            let now = Int64(Date().timeIntervalSince1970 * 1000)
            availability.setLocal(
                projection.state(for: interval, capturedAt: now, now: now, maxAge: 1), request: request)
            let value = try await session.readBusySnapshots(context)
            try Task.checkCancellation()
            guard availability.isCurrent(request), scenePhase == .active else { return }
            availability.setSnapshots(value, request: request)
        } catch { availability.setSnapshots(nil, request: request) }
    }
}

extension String {
    var capitalizedFirst: String { prefix(1).uppercased() + dropFirst() }
}
