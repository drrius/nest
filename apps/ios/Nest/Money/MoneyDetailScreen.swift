import SwiftUI

struct MoneyDetailScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let eventId: UUID
    @State private var detail: MoneyDetail?
    @State private var notice: String?
    @State private var loading = false
    @State private var request = UUID()

    var body: some View {
        List {
            if let detail {
                Section {
                    Text(detail.event.description).font(.headline)
                    Text(detail.event.amountCentimes.absoluteCHF).font(.title).monospacedDigit()
                    Text(detail.event.occurredOn)
                    Text(detail.event.kind.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                    if let category = detail.category { Text(category.name) }
                    if let note = detail.note, !note.isEmpty { Text(note) }
                    if let total = detail.receiptTotalCentimes { Text("Receipt total: \(total.absoluteCHF)") }
                }
                Section("Recorded shares") {
                    ForEach(detail.shares) { share in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(share.id == member.userId ? "You" : "Your partner").font(.headline)
                            if let allocation = share.allocatedCentimes { Text("Allocated: \(allocation.absoluteCHF)") }
                            Text(
                                "Balance change: \(share.deltaCentimes.value < 0 ? "−" : "+")\(share.deltaCentimes.absoluteCHF)"
                            )
                            .monospacedDigit()
                        }
                    }
                    Text("Positive increases what you are owed; negative increases what you owe.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                if let related = detail.event.relatedEventId {
                    Section { linked("Original entry", id: related) }
                }
                if let reversal = detail.reversedById {
                    Section { linked("Reversal entry", id: reversal) }
                }
            }
            if loading { ProgressView("Loading entry…") }
            if let notice { Text(notice) }
            Button("Refresh entry") { Task { await load() } }.disabled(loading)
        }
        .navigationTitle("Entry details")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task(id: eventId) { await load() }
    }

    private func linked(_ title: String, id: UUID) -> some View {
        NavigationLink(title) { MoneyDetailScreen(session: session, member: member, eventId: id) }
    }

    private func load() async {
        let attempt = UUID()
        request = attempt
        detail = nil
        notice = nil
        loading = true
        defer { if request == attempt { loading = false } }
        do {
            let value = try await session.readMoneyDetail(
                member: member, generation: session.generation, eventId: eventId)
            try Task.checkCancellation()
            guard request == attempt else { return }
            detail = value
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load this entry. Try again online."
        }
    }
}
