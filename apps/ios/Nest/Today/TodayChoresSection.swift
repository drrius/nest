import SwiftUI

/// Today's chores: tick one and it fills, pauses a beat, then tucks into "done today".
struct TodayChoresSection: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let moment: TodayMoment
    @Binding var everyone: Bool
    @State private var ticked: Set<UUID> = []
    @State private var saving: Set<UUID> = []
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center) {
                    header
                    Spacer(minLength: 8)
                    TodayChoreFilter(everyone: $everyone)
                }
                VStack(alignment: .leading, spacing: 10) {
                    header
                    TodayChoreFilter(everyone: $everyone)
                }
            }
            if let notice = model.todayNotice { noticeRow(notice) }
            content
        }
    }

    private var header: some View {
        NavigationLink {
            RoutinesScreen(model: model)
        } label: {
            NestSectionHeader(title: "Chores", chevron: true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Manage chores")
    }

    @ViewBuilder
    private var content: some View {
        switch model.today {
        case .idle, .loading:
            TodayChoreSkeleton()
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("Couldn’t load your chores.").foregroundStyle(NestColor.ink)
                Button("Try again") { Task { await model.refreshToday() } }
                    .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
            }
            .nestCard()
        case .loaded(let state):
            loaded(state)
        }
    }

    @ViewBuilder
    private func loaded(_ state: ChoreOfflineState) -> some View {
        let visible = state.chores.filter {
            $0.visibleToday(on: moment.day, actor: member.userId, everyone: everyone)
        }
        let open = visible.filter { $0.state != .completed || ticked.contains($0.id) }
        let done = visible.filter { $0.state == .completed && !ticked.contains($0.id) }
        if open.isEmpty {
            TodayAllClear(done: done.map(\.chore.title))
                .transition(.opacity.combined(with: .scale(scale: 0.96)))
        } else {
            VStack(spacing: 0) {
                ForEach(Array(open.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { NestRowDivider(leading: 58) }
                    TodayChoreRow(
                        item: item, moment: moment, ticked: ticked.contains(item.id), busy: saving.contains(item.id),
                        complete: { tick(item.chore) },
                        discard: { operation in Task { await model.discard(operation) } }
                    )
                    .transition(.asymmetric(insertion: .opacity, removal: .opacity.combined(with: .move(edge: .top))))
                }
                if !done.isEmpty { TodayDoneBar(titles: done.map(\.chore.title)) }
            }
            .nestCard(padding: 0)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
            .animation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.86), value: open.map(\.id))
        }
    }

    private func noticeRow(_ notice: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "icloud.slash").foregroundStyle(NestColor.ink2)
            Text(notice).font(.footnote).foregroundStyle(NestColor.ink2)
            Spacer(minLength: 4)
            Button("Retry") { Task { await model.refreshToday() } }
                .font(.footnote.weight(.semibold))
                .accessibilityLabel("Retry sync")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(NestColor.fill, in: Capsule())
    }

    /// The row is held while the change is queued. Only a saved change ticks, lingers a beat, then tucks away.
    private func tick(_ chore: NestChore) {
        guard saving.insert(chore.id).inserted else { return }
        let motion: Animation? = reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.86)
        Task {
            await model.complete(chore)
            saving.remove(chore.id)
            guard saved(chore.id) else { return }
            withAnimation(motion) { _ = ticked.insert(chore.id) }
            try? await Task.sleep(for: .milliseconds(reduceMotion ? 300 : 900))
            withAnimation(motion) { _ = ticked.remove(chore.id) }
        }
    }

    private func saved(_ id: UUID) -> Bool {
        guard case .loaded(let state) = model.today else { return false }
        return state.chores.contains { $0.id == id && $0.state != .open }
    }
}

struct TodayChoreRow: View {
    let item: LocalChore
    let moment: TodayMoment
    let ticked: Bool
    var busy = false
    let complete: () -> Void
    let discard: (UUID) -> Void

    @Environment(\.memberPalette) private var palette

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: complete) {
                HStack(spacing: 14) {
                    CheckCircle(
                        isOn: ticked || item.state == .pending || item.state == .completed,
                        pending: item.state == .pending && !ticked)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.chore.title)
                            .foregroundStyle(ticked ? NestColor.ink3 : NestColor.ink)
                            .strikethrough(ticked, color: NestColor.ink3)
                        Text(detail).font(.footnote).foregroundStyle(detailColor)
                    }
                    Spacer(minLength: 8)
                    AssigneeBadge(kind: item.chore.assigneeId.map { .person($0) } ?? .shared)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(NestPressStyle())
            .disabled(item.state != .open || ticked || busy)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(item.chore.title)
            .accessibilityValue("\(detail), \(assignee)")
            .accessibilityHint(item.state == .open ? "Marks it done" : "")
            if item.state == .conflict, let operation = item.operationId {
                Button("Discard saved change") { discard(operation) }
                    .font(.footnote.weight(.semibold))
                    .padding(.leading, 58)
                    .padding(.bottom, 12)
                    .frame(minHeight: 44)
            }
        }
    }

    private var assignee: String {
        guard let id = item.chore.assigneeId else { return "Shared" }
        return id == palette.me ? "Yours" : "\(palette.name(id))’s"
    }

    private var detail: String {
        if ticked { return "Done" }
        switch item.state {
        case .open: return moment.dueLabel(item.chore.dueDate)
        case .pending: return "Saved on this iPhone · syncs when online"
        case .completed: return "Done"
        case .conflict: return item.conflictReason?.message ?? "Needs review · change was not applied"
        }
    }

    private var detailColor: Color {
        if item.state == .conflict { return NestColor.warn }
        if item.state == .open && item.chore.dueDate.value < moment.day.value { return NestColor.warn }
        return NestColor.ink2
    }
}

struct TodayDoneBar: View {
    let titles: [String]

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "checkmark.circle").foregroundStyle(NestColor.good)
            Text("\(titles.count) done today").fontWeight(.medium).foregroundStyle(NestColor.ink2).layoutPriority(1)
            Text(titles.joined(separator: ", ")).foregroundStyle(NestColor.ink3).lineLimit(1)
            Spacer(minLength: 0)
        }
        .font(.footnote)
        .padding(.horizontal, 16)
        .frame(minHeight: 48)
        .background(NestColor.fill)
        .accessibilityElement(children: .combine)
    }
}

struct TodayAllClear: View {
    let done: [String]

    var body: some View {
        VStack(spacing: 6) {
            NestArt(width: 150)
            Text(done.isEmpty ? "Nothing due today" : "All done around the house")
                .font(.title3.weight(.semibold)).foregroundStyle(NestColor.ink)
            Text(done.isEmpty ? "Enjoy the quiet." : "Nothing else is due today. Enjoy it.")
                .font(.subheadline).foregroundStyle(NestColor.ink2)
            if !done.isEmpty { TodayDoneBar(titles: done).clipShape(Capsule()).padding(.top, 10) }
        }
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
        .nestCard(padding: 22)
    }
}

struct TodayChoreSkeleton: View {
    var body: some View {
        VStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { index in
                if index > 0 { NestRowDivider() }
                HStack(spacing: 14) {
                    Circle().fill(NestColor.fill2).frame(width: 28, height: 28)
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 5).fill(NestColor.fill2).frame(width: 150, height: 13)
                        RoundedRectangle(cornerRadius: 5).fill(NestColor.fill).frame(width: 90, height: 10)
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .frame(height: 64)
            }
        }
        .nestCard(padding: 0)
        .accessibilityLabel("Loading chores")
    }
}
