import SwiftUI

struct MoneyHistorySection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var previewCount: Int? = nil
    @State private var events: [MoneyEventSummary] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var notice: String?
    @State private var savedNotice: String?
    @State private var request = UUID()
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        Section {
            if let savedNotice { Text(savedNotice).foregroundStyle(QuietPalette.muted) }
            ForEach(Array(events.prefix(previewCount ?? events.count))) { event in
                NavigationLink {
                    MoneyDetailScreen(session: session, member: member, eventId: event.id)
                } label: {
                    HStack(spacing: 12) {
                        activity(event)
                        Image(systemName: "chevron.right").font(.caption)
                            .foregroundStyle(QuietPalette.muted)
                    }
                    .padding(.vertical, 8).frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                    .contentShape(Rectangle())
                    .overlay(alignment: .bottom) { QuietPalette.border.frame(height: 1) }
                }
                .buttonStyle(.plain)
            }
            if loading { ProgressView("Loading history…") }
            if let notice { Text(notice) }
            if events.isEmpty && !loading && notice == nil { Text("No financial history yet.") }
            if previewCount == nil, next != nil {
                Button {
                    Task { await load(more: true) }
                } label: {
                    Text("Load older entries").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }.disabled(loading)
            }
            if let previewCount, events.count > previewCount || next != nil {
                NavigationLink {
                    MoneyHistoryScreen(session: session, member: member).id(session.generation)
                } label: {
                    QuietActionLabel("View full history")
                }
            }
            Button {
                Task { await load(more: false) }
            } label: {
                Text("Refresh history").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }.disabled(loading)
        } header: {
            Text("Recent activity").font(.headline).foregroundStyle(QuietPalette.ink)
                .textCase(nil).padding(.top, 12)
        }
        .task {
            if previewCount != nil || events.isEmpty { await load(more: false) }
        }
    }

    @ViewBuilder private func activity(_ event: MoneyEventSummary) -> some View {
        if textSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                description(event)
                Text(event.amountCentimes.absoluteCHF).font(.headline).monospacedDigit()
            }
        } else {
            HStack(alignment: .top, spacing: 16) {
                description(event).frame(maxWidth: .infinity, alignment: .leading)
                Text(event.amountCentimes.absoluteCHF).font(.subheadline.weight(.medium)).monospacedDigit()
                    .fixedSize()
            }
        }
    }

    private func description(_ event: MoneyEventSummary) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(event.description).font(.body.weight(.medium)).foregroundStyle(QuietPalette.ink)
            Text("\(event.kind.rawValue.replacingOccurrences(of: "_", with: " ").capitalized) · \(event.occurredOn)")
                .font(.caption).foregroundStyle(QuietPalette.muted)
            if event.hasReceipt { Label("Receipt attached", systemImage: "paperclip").font(.caption) }
        }
    }

    private func load(more: Bool) async {
        let attempt = UUID()
        request = attempt
        let cursor = more ? next : nil
        loading = true
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            await showSavedHistory(more: more, attempt: attempt)
            let read = try await session.loadMoneyHistory(
                member: member, generation: session.generation, before: cursor)
            try Task.checkCancellation()
            guard request == attempt else { return }
            let result = read.value
            try present(result, more: more)
            if !more || read.notice != nil { savedNotice = read.notice }
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            if (error as? NestAPIFailure) != .unavailable && !(error is URLError) {
                events = []
                next = nil
                savedNotice = nil
            }
            notice = "Could not load history. Try again online."
        }
    }

    private func showSavedHistory(more: Bool, attempt: UUID) async {
        guard !more, events.isEmpty else { return }
        guard
            let saved = try? await session.cachedMoneyRead(
                .history(member, before: nil), generation: session.generation),
            request == attempt, !Task.isCancelled
        else { return }
        events = saved.value.events
        next = saved.value.next
        savedNotice = saved.notice
    }

    private func present(_ result: MoneyHistory, more: Bool) throws {
        if more, let last = events.last, let first = result.events.first {
            guard last.precedes(first), Set(events.map(\.id)).isDisjoint(with: result.events.map(\.id)) else {
                throw NestAPIFailure.contract
            }
        }
        events = more ? events + result.events : result.events
        next = result.next
    }
}
