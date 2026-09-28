import SwiftUI

struct MoneyHistorySection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var events: [MoneyEventSummary] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        Section("History") {
            ForEach(events) { event in
                VStack(alignment: .leading, spacing: 6) {
                    Text(event.description).font(.headline)
                    Text(event.amountCentimes.absoluteCHF).monospacedDigit()
                    Text(
                        "\(event.kind.rawValue.replacingOccurrences(of: "_", with: " ").capitalized) · \(event.occurredOn)"
                    )
                    .font(.caption).foregroundStyle(QuietPalette.muted)
                    if event.hasReceipt { Label("Receipt attached", systemImage: "paperclip").font(.caption) }
                }.padding(.vertical, 4)
            }
            if loading { ProgressView("Loading history…") }
            if let notice { Text(notice) }
            if events.isEmpty && !loading && notice == nil { Text("No financial history yet.") }
            if next != nil { Button("Load older entries") { Task { await load(more: true) } }.disabled(loading) }
            Button("Refresh history") { Task { await load(more: false) } }.disabled(loading)
        }
        .task { await load(more: false) }
    }

    private func load(more: Bool) async {
        let attempt = UUID()
        request = attempt
        let cursor = more ? next : nil
        if !more {
            events = []
            next = nil
        }
        loading = true
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            let result = try await session.readMoneyHistory(
                member: member, generation: session.generation, before: cursor)
            try Task.checkCancellation()
            guard request == attempt else { return }
            if let last = events.last, let first = result.events.first {
                guard last.precedes(first), Set(events.map(\.id)).isDisjoint(with: result.events.map(\.id)) else {
                    throw NestAPIFailure.contract
                }
            }
            events.append(contentsOf: result.events)
            next = result.next
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load history. Try again online."
        }
    }
}
