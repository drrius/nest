import SwiftUI

struct PartnerBusySection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @State private var envelope: BusySnapshotsEnvelope?
    @State private var actor: UUID?
    @State private var notice: String?
    @State private var loading = false

    var body: some View {
        Section("Your partner’s availability") {
            if loading {
                ProgressView("Checking busy times…")
            } else if let notice {
                Text(notice)
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { timeline in
                    availability(now: timeline.date)
                }
            }
            Button("Refresh busy times") { Task { await load() } }
        }
        .task { await load() }
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
                Text("No busy times in your partner’s shared calendars for this day.")
                Text("Other calendars and plans may not be shared.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            } else {
                ForEach(Array(intervals.enumerated()), id: \.offset) { _, interval in
                    let start = Date(timeIntervalSince1970: Double(max(interval.start, query.start)) / 1000)
                    let end = Date(timeIntervalSince1970: Double(min(interval.end, query.end)) / 1000)
                    VStack(alignment: .leading, spacing: 4) {
                        Label("Busy", systemImage: "clock")
                        Text(
                            "\(start.formatted(date: .omitted, time: .shortened)) – \(end.formatted(date: .omitted, time: .shortened))"
                        )
                        .font(.subheadline).foregroundStyle(QuietPalette.muted)
                    }.padding(.vertical, 4)
                }
            }
        } else {
            Text(
                "Availability is unknown. Your partner may not be sharing, or their snapshot may be stale or outside this day."
            )
            .foregroundStyle(QuietPalette.muted)
        }
    }

    private func load() async {
        guard !loading else { return }
        loading = true
        envelope = nil
        defer { loading = false }
        do {
            let context = try await session.calendarConsentContext()
            let value = try await session.readBusySnapshots(context)
            try Task.checkCancellation()
            actor = context.member.userId
            envelope = value
            notice = nil
        } catch {
            if !Task.isCancelled { notice = "Could not check busy times. Availability is unknown; try again online." }
        }
    }
}
