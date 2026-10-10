import EventKit
import SwiftUI

struct TodayCalendarSection: View {
    @State private var clockStart = Date()
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let refresh: UUID
    @StateObject private var calendar: CalendarModel
    @State private var visible = false
    @Environment(\.scenePhase) private var scenePhase

    init(session: SessionModel, member: VerifiedMember, refresh: UUID) {
        self.session = session
        self.member = member
        self.refresh = refresh
        _calendar = StateObject(
            wrappedValue: CalendarModel(selectionStore: CalendarSelectionStore(member: member)))
    }

    @Environment(\.switchTab) private var switchTab
    @Environment(\.memberPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                switchTab(.calendar)
            } label: {
                NestSectionHeader(title: "Coming up", chevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open Calendar")
            TimelineView(.periodic(from: clockStart, by: 60)) { clock in
                content(now: clock.date)
                    .onChange(of: clock.date) { _, now in update(now) }
            }
            .nestCard(padding: 0)
        }
        .task(id: refresh) {
            visible = true
            update(.now)
        }
        .onChange(of: scenePhase) { _, _ in update(.now) }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in update(.now) }
        .onDisappear {
            visible = false
            calendar.clearVisibleDetails()
        }
    }

    @ViewBuilder
    private func content(now: Date) -> some View {
        if scenePhase != .active {
            message("Calendar details are hidden while Nest is inactive.", icon: "eye.slash")
        } else if calendar.access != .allowed {
            message("See your day here. Your event details stay on this iPhone.", icon: "calendar.badge.plus")
        } else if calendar.calendars.isEmpty {
            message("No calendars are available on this device.", icon: "calendar")
        } else if calendar.selected.isEmpty {
            message("Choose which calendars to show.", icon: "calendar")
        } else {
            let upcoming = calendar.events.filter { $0.end > now }
            if upcoming.isEmpty {
                message("Nothing else on your calendar today.", icon: "sun.max")
            }
            ForEach(Array(upcoming.prefix(3).enumerated()), id: \.element.id) { index, event in
                if index > 0 { NestRowDivider(leading: 78) }
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(event.allDay ? "All day" : event.start.formatted(date: .omitted, time: .shortened))
                            .font(.system(.subheadline, design: .rounded, weight: .semibold))
                            .foregroundStyle(NestColor.ink)
                        if !event.allDay {
                            Text(event.end.formatted(date: .omitted, time: .shortened))
                                .font(.system(.caption, design: .rounded)).foregroundStyle(NestColor.ink3)
                        }
                    }
                    .monospacedDigit()
                    .frame(width: 50, alignment: .leading)
                    RoundedRectangle(cornerRadius: 2).fill(palette.color(palette.me).color).frame(width: 4)
                    Text(event.title).foregroundStyle(NestColor.ink).lineLimit(2)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func message(_ text: String, icon: String) -> some View {
        Button {
            switchTab(.calendar)
        } label: {
            HStack(spacing: 12) {
                IconTile(systemName: icon, domain: .calendar, size: 34)
                Text(text).font(.subheadline).foregroundStyle(NestColor.ink2).multilineTextAlignment(.leading)
                Spacer(minLength: 4)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(NestColor.ink3)
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
    }

    private func update(_ now: Date) {
        guard visible, scenePhase == .active, session.status == .ready(member) else {
            calendar.clearVisibleDetails()
            return
        }
        calendar.refresh(day: now)
    }
}
