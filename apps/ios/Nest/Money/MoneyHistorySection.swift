import SwiftUI

struct MoneyHistorySection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var previewCount: Int? = nil
    var refresh: UUID?
    @State private var events: [MoneyEventSummary] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var notice: String?
    @State private var savedNotice: String?
    @State private var request = UUID()

    @Environment(\.memberPalette) private var palette
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                NestSectionHeader(title: previewCount == nil ? "All activity" : "Activity")
                Spacer()
                if let previewCount, events.count > previewCount || next != nil {
                    NavigationLink("See all") {
                        MoneyHistoryScreen(session: session, member: member).id(session.generation)
                    }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityLabel("View full history")
                }
            }
            if let savedNotice { Text(savedNotice).font(.footnote).foregroundStyle(NestColor.ink2) }
            if !events.isEmpty { activityRows }
            if loading && events.isEmpty { ProgressView().frame(maxWidth: .infinity, minHeight: 80) }
            if let notice {
                TodayForYouRetry(text: notice) { Task { await load(more: false) } }
            }
            if events.isEmpty && !loading && notice == nil {
                Text("No shared expenses yet. Add the first one with Expense.")
                    .font(.subheadline).foregroundStyle(NestColor.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .nestCard()
            }
            if previewCount == nil, next != nil {
                Button("Load older entries") { Task { await load(more: true) } }
                    .buttonStyle(NestButtonStyle(kind: .plain, small: true))
                    .disabled(loading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .task(id: refresh) {
            if previewCount != nil || events.isEmpty { await load(more: false) }
        }
    }

    private var shown: [MoneyEventSummary] { Array(events.prefix(previewCount ?? events.count)) }

    private var activityRows: some View {
        let days = Dictionary(grouping: shown, by: \.occurredOn)
        let order = shown.map(\.occurredOn).reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
        return LazyVStack(alignment: .leading, spacing: 8) {
            ForEach(order, id: \.self) { day in
                Text(dayLabel(day)).font(.footnote.weight(.semibold)).foregroundStyle(NestColor.ink2)
                    .padding(.top, 8).padding(.leading, 4)
                VStack(spacing: 0) {
                    ForEach(Array((days[day] ?? []).enumerated()), id: \.element.id) { index, event in
                        if index > 0 { NestRowDivider(leading: 66) }
                        row(event)
                    }
                }
                .nestCard(padding: 0)
            }
        }
    }

    private func row(_ event: MoneyEventSummary) -> some View {
        NavigationLink {
            MoneyDetailScreen(session: session, member: member, eventId: event.id)
        } label: {
            let layout =
                textSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
            layout {
                IconTile(systemName: symbol(event.kind), domain: domain(event.kind), size: 40)
                VStack(alignment: .leading, spacing: 2) {
                    Text(event.description).foregroundStyle(NestColor.ink)
                        .lineLimit(textSize.isAccessibilitySize ? nil : 2)
                    HStack(spacing: 4) {
                        Text(meta(event))
                        if event.hasReceipt { Image(systemName: "paperclip").accessibilityLabel("Receipt attached") }
                    }
                    .font(.footnote).foregroundStyle(NestColor.ink2)
                }
                if !textSize.isAccessibilitySize { Spacer(minLength: 8) }
                Text(Centimes.chf(abs(event.amountCentimes.value)).replacingOccurrences(of: "CHF ", with: ""))
                    .font(.system(.body, design: .rounded, weight: .semibold)).monospacedDigit()
                    .foregroundStyle(NestColor.ink)
                    .fixedSize()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
        .accessibilityIdentifier("money-event-\(event.id.uuidString.lowercased())")
    }

    private func meta(_ event: MoneyEventSummary) -> String {
        let who = event.payerId.map { palette.name($0) == "You" ? "You paid" : "\(palette.name($0)) paid" }
        switch event.kind {
        case .settlement: return who.map { $0.replacingOccurrences(of: "paid", with: "settled up") } ?? "Settle up"
        case .refund: return "Refund" + (who.map { " · \($0)" } ?? "")
        case .reversal, .replacement: return "Correction"
        case .openingBalance: return "Opening balance"
        case .expense: return who ?? "Shared expense"
        }
    }

    private func symbol(_ kind: MoneyEventSummary.Kind) -> String {
        switch kind {
        case .expense: "cart"
        case .settlement: "arrow.left.arrow.right"
        case .refund: "arrow.uturn.backward"
        case .reversal, .replacement: "pencil"
        case .openingBalance: "flag"
        }
    }

    private func domain(_ kind: MoneyEventSummary.Kind) -> NestDomain {
        switch kind {
        case .expense: .groceries
        case .settlement: .house
        case .refund: .money
        case .reversal, .replacement, .openingBalance: .neutral
        }
    }

    private func dayLabel(_ value: String) -> String {
        guard let civil = try? CivilDate(value), let date = civil.localDay(timeZone: TimeZone(secondsFromGMT: 0)!)
        else { return value }
        let today = (try? TodayMoment(now: .now))?.day.value
        if value == today { return "Today" }
        return date.formatted(
            Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).weekday(.wide).day().month(.wide))
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
