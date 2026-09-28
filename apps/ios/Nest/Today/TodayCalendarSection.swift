import EventKit
import SwiftUI

struct TodayCalendarSection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let refresh: UUID
    @StateObject private var calendar: CalendarModel
    @Environment(\.scenePhase) private var scenePhase

    init(session: SessionModel, member: VerifiedMember, refresh: UUID) {
        self.session = session
        self.member = member
        self.refresh = refresh
        _calendar = StateObject(
            wrappedValue: CalendarModel(selectionStore: CalendarSelectionStore(member: member)))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("On your calendar").font(.headline).foregroundStyle(QuietPalette.ink)
            TimelineView(.periodic(from: .now, by: 60)) { clock in
                content(now: clock.date)
                    .onChange(of: clock.date) { _, now in update(now) }
            }
            NavigationLink("Open Calendar") { CalendarScreen(member: member, session: session) }
                .font(.subheadline.weight(.medium)).frame(minHeight: 44)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
        .task(id: refresh) { update(.now) }
        .onChange(of: scenePhase) { _, _ in update(.now) }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in update(.now) }
        .onDisappear { calendar.clearVisibleDetails() }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        if scenePhase != .active {
            Text("Calendar details are hidden while Nest is inactive.")
                .foregroundStyle(QuietPalette.muted)
        } else if calendar.access != .allowed {
            Text("Open Calendar to review access. Your personal details stay on this device.")
                .foregroundStyle(QuietPalette.muted)
        } else if calendar.calendars.isEmpty {
            Text("No calendars are available on this device.").foregroundStyle(QuietPalette.muted)
        } else if calendar.selected.isEmpty {
            Text("Choose which calendars to display in Calendar.").foregroundStyle(QuietPalette.muted)
        } else {
            let upcoming = calendar.events.filter { $0.end > now }
            if upcoming.isEmpty {
                Text("No more events today in your selected calendars.").foregroundStyle(QuietPalette.muted)
            }
            ForEach(Array(upcoming.prefix(3))) { event in
                VStack(alignment: .leading, spacing: 4) {
                    Text(event.title).foregroundStyle(QuietPalette.ink)
                    Text(event.allDay ? "All day" : event.start.formatted(date: .omitted, time: .shortened))
                        .font(.caption).foregroundStyle(QuietPalette.muted)
                }
            }
            Text("Only your selected calendars · details stay on this device")
                .font(.caption).foregroundStyle(QuietPalette.muted)
        }
    }

    private func update(_ now: Date) {
        guard scenePhase == .active, session.status == .ready(member) else {
            calendar.clearVisibleDetails()
            return
        }
        calendar.refresh(day: now)
    }
}
