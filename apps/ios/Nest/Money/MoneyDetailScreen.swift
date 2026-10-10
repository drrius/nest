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
            if let notice { Text(notice).foregroundStyle(QuietPalette.muted) }
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
                if [.expense, .replacement].contains(detail.event.kind), detail.reversedById == nil {
                    Section {
                        NavigationLink("Record refund") {
                            RefundScreen(session: session, member: member, sourceEventId: eventId).id(
                                session.generation)
                        }
                    }
                }
                if detail.event.kind != .reversal {
                    Section {
                        NavigationLink("Correct entry") {
                            CorrectionScreen(session: session, member: member, sourceEventId: eventId)
                                .id(session.generation)
                        }
                    }
                }
                if detail.event.hasReceipt {
                    Section { ReceiptButton(session: session, member: member, eventId: eventId) }
                }
                QuietFormSection("Recorded shares") {
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
                    Text("Positive means owed more or owing less; negative means owing more or owed less.")
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
        notice = nil
        loading = true
        defer { if request == attempt { loading = false } }
        do {
            if detail == nil,
                let saved = try? await session.cachedMoneyRead(
                    .detail(member, eventId: eventId), generation: session.generation)
            {
                guard request == attempt, !Task.isCancelled else { return }
                detail = saved.value
                notice = saved.notice
            }
            let read = try await session.loadMoneyDetail(
                member: member, generation: session.generation, eventId: eventId)
            try Task.checkCancellation()
            guard request == attempt else { return }
            detail = read.value
            notice = read.notice
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            if (error as? NestAPIFailure) != .unavailable && !(error is URLError) { detail = nil }
            notice =
                detail == nil
                ? "Could not load this entry. Try again online."
                : "Showing the previous entry details. Connect and refresh for updates."
        }
    }
}
