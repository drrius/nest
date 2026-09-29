import SwiftUI

struct DailySummaryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var summaryId: UUID? = nil
    @State private var snapshot: DailySummarySnapshot?
    @State private var loaded = false
    @State private var busy = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        List {
            if let snapshot {
                Section("Saved for \(snapshot.summary.date.value)") {
                    count("Chores due", snapshot.summary.choresDue)
                    count("Chores overdue", snapshot.summary.choresOverdue)
                    count("Meals planned", snapshot.summary.mealsPlanned)
                    count("Renewals due", snapshot.summary.renewalsDue)
                    count("Cancellation deadlines", snapshot.summary.cancellationDeadlines)
                }
                Section {
                    Text(
                        "This is a saved snapshot for the date shown. Your household may have changed since then. It does not confirm notification delivery."
                    )
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
                }
            } else if loaded {
                Text("No daily summary has been saved for you yet.")
                Text("This does not mean your day is empty. Your current household information is on Today.")
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
            }
            if let notice { Text(notice) }
            if busy { ProgressView("Loading your saved summary…") }
            Button("Refresh") { Task { await load() } }.disabled(busy)
        }
        .navigationTitle("Daily summary")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: session.generation) {
            request = UUID()
            snapshot = nil
            loaded = false
        }
        .onDisappear {
            request = UUID()
            snapshot = nil
            loaded = false
        }
    }

    private func count(_ label: String, _ value: SummaryCount) -> some View {
        LabeledContent(label, value: value.more ? "\(value.count)+" : String(value.count))
    }

    private func load() async {
        guard !busy else { return }
        let attempt = UUID()
        request = attempt
        busy = true
        snapshot = nil
        loaded = false
        notice = nil
        defer { busy = false }
        do {
            let context = try session.notificationContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let value: DailySummarySnapshot?
            if let summaryId {
                value = try await session.readSummary(context, id: summaryId)
            } else {
                value = try await session.readLatestSummary(context).latest
            }
            guard request == attempt, !Task.isCancelled else { return }
            snapshot = value
            loaded = true
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load your saved summary. Connect and try again."
        }
    }
}
