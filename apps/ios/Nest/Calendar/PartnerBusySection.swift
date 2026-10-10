import SwiftUI

struct PartnerBusySection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @State private var envelope: BusySnapshotsEnvelope?
    @State private var actor: UUID?
    @State private var notice: String?
    @State private var loading = false
    @State private var request = UUID()

    @Environment(\.memberPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                NestSectionHeader(title: "\(palette.partnerName.capitalizedFirst)’s busy times")
                Spacer()
                Button("Refresh") { Task { await load() } }
                    .font(.subheadline.weight(.semibold)).disabled(loading)
                    .accessibilityLabel("Refresh busy times")
            }
            VStack(alignment: .leading, spacing: 0) {
                if loading && envelope == nil {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 60)
                } else if let notice {
                    note(notice, icon: "exclamationmark.circle")
                } else {
                    TimelineView(.periodic(from: .now, by: 30)) { timeline in
                        availability(now: timeline.date)
                    }
                }
            }
            .nestCard(padding: 0)
        }
        .task(id: day) { await load() }
    }

    @ViewBuilder
    private func availability(now: Date) -> some View {
        if let window = Calendar.current.dateInterval(of: .day, for: day),
            let query = EventKitBusyMapping.interval(start: window.start, end: window.end),
            let snapshot = envelope?.snapshots.first(where: { $0.actorId != actor }),
            snapshot.state(for: query, now: now) != .unknown
        {
            let intervals = snapshot.intervals.filter { $0.start < query.end && $0.end > query.start }
            if intervals.isEmpty {
                note("Nothing busy in what \(palette.partnerName) shares for this day.", icon: "sun.max")
            } else {
                ForEach(Array(intervals.enumerated()), id: \.offset) { index, interval in
                    if index > 0 { NestRowDivider(leading: 16) }
                    busyRow(interval, query: query, color: palette.color(snapshot.actorId).color)
                }
            }
            Text(updated(snapshot)).font(.caption).foregroundStyle(NestColor.ink3)
                .padding(.horizontal, 16).padding(.bottom, 12).padding(.top, 4)
        } else if let shared = envelope?.snapshots.first(where: { $0.actorId != actor }) {
            note(
                expired(shared, now: now)
                    ? "\(palette.partnerName.capitalizedFirst)’s busy times are out of date, so this day is unknown."
                    : "\(palette.partnerName.capitalizedFirst)’s shared busy times don’t cover this day yet, so it’s unknown.",
                icon: "clock")
        } else {
            note(
                "\(palette.partnerName.capitalizedFirst) hasn’t shared busy times for this day. Details are never shared.",
                icon: "lock")
        }
    }

    private func expired(_ snapshot: BusySnapshot, now: Date) -> Bool {
        (try? BusyCapture.timestamp(snapshot.expiresAt)).map { now >= $0 } ?? true
    }

    private func busyRow(_ interval: BusyInterval, query: BusyInterval, color: Color) -> some View {
        let start = Date(timeIntervalSince1970: Double(max(interval.start, query.start)) / 1000)
        let end = Date(timeIntervalSince1970: Double(min(interval.end, query.end)) / 1000)
        let allDay = interval.start <= query.start && interval.end >= query.end
        return HStack(spacing: 12) {
            Text(allDay ? "All day" : start.formatted(date: .omitted, time: .shortened))
                .font(.system(.subheadline, design: .rounded, weight: .semibold)).monospacedDigit()
                .frame(width: 58, alignment: .leading)
            HStack {
                Text("Busy").font(.subheadline.weight(.semibold))
                Spacer()
                if !allDay {
                    Text("until \(end.formatted(date: .omitted, time: .shortened))").font(.footnote)
                }
            }
            .foregroundStyle(NestColor.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: 40)
            .background(HatchFill(color: color))
            .overlay(alignment: .leading) { Rectangle().fill(color).frame(width: 3) }
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityElement(children: .combine)
    }

    private func note(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon).font(.subheadline).foregroundStyle(NestColor.ink2).padding(16)
    }

    private func updated(_ snapshot: BusySnapshot) -> String {
        guard let captured = try? BusyCapture.timestamp(snapshot.capturedAt) else { return "Busy times only" }
        return "Busy times only · updated \(captured.formatted(.relative(presentation: .named)))"
    }

    /// Each load supersedes the previous one, so changing day mid-request still ends with this day's answer.
    private func load() async {
        let attempt = UUID()
        request = attempt
        loading = true
        envelope = nil
        defer { if request == attempt { loading = false } }
        do {
            let context = try await session.calendarConsentContext()
            let value = try await session.readBusySnapshots(context)
            try Task.checkCancellation()
            guard request == attempt else { return }
            actor = context.member.userId
            envelope = value
            notice = nil
        } catch {
            guard !Task.isCancelled, request == attempt else { return }
            notice = "Could not check busy times. Availability is unknown; try again online."
        }
    }
}
