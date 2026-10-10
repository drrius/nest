import SwiftUI

/// Requests from your partner to take over one of their chores. Accepting or declining uses the same saved,
/// retryable handover command as the full handovers screen.
struct TodayHandoverCard: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var working: UUID?
    @State private var notice: String?
    @Environment(\.memberPalette) private var palette

    var body: some View {
        let incoming = transfers
        if !incoming.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(incoming.enumerated()), id: \.element.requestId) { index, transfer in
                    if index > 0 { NestRowDivider(leading: 64) }
                    row(transfer)
                }
                if let notice {
                    NavigationLink {
                        ChoreHandoversScreen(model: model)
                    } label: {
                        Label(notice, systemImage: "exclamationmark.circle")
                            .font(.footnote).foregroundStyle(NestColor.warn)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
                }
            }
            .nestCard(padding: 0)
            .transition(.opacity.combined(with: .scale(scale: 0.97)))
        }
    }

    private var transfers: [PendingChoreTransfer] {
        guard case .loaded(let state) = model.today else { return [] }
        return state.snapshot.transfers.filter { $0.toMemberId == member.userId }
    }

    private func row(_ transfer: PendingChoreTransfer) -> some View {
        HStack(alignment: .top, spacing: 12) {
            MemberAvatar(id: transfer.fromMemberId, size: 36)
            VStack(alignment: .leading, spacing: 4) {
                (Text("\(palette.name(transfer.fromMemberId)) asked you to take ")
                    + Text(transfer.title).fontWeight(.semibold))
                    .foregroundStyle(NestColor.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Due \(transfer.dueDate.value == todayValue ? "today" : transfer.dueDate.value)")
                    .font(.footnote).foregroundStyle(NestColor.ink2)
                HStack(spacing: 8) {
                    Button("Take it") { Task { await respond(transfer, .accept) } }
                        .buttonStyle(NestButtonStyle(kind: .primary, small: true))
                        .accessibilityLabel("Accept handover")
                    Button("Not this time") { Task { await respond(transfer, .decline) } }
                        .buttonStyle(NestButtonStyle(kind: .plain, small: true))
                        .accessibilityLabel("Decline handover")
                }
                .disabled(working != nil)
                .padding(.top, 8)
            }
        }
        .padding(16)
    }

    private var todayValue: String {
        (try? TodayMoment(now: .now))?.day.value ?? ""
    }

    private func respond(_ transfer: PendingChoreTransfer, _ action: RespondChoreTransfer.Action) async {
        guard working == nil else { return }
        working = transfer.requestId
        defer { working = nil }
        var staged = false
        do {
            let context = try model.routineCreateContext()
            guard try await model.savedChoreTransfer(context) == nil else {
                notice = "Finish your saved handover first"
                return
            }
            try await model.stageTransferResponse(transfer, action: action, context: context)
            staged = true
            let saved = try await model.retryChoreTransfer(context)
            guard saved.receipt != nil, !saved.conflicted else {
                notice = "Couldn’t finish this handover · review it"
                return
            }
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { notice = nil }
            try await model.finishChoreTransfer(context, operation: saved.command.operationId)
        } catch {
            notice = staged ? "Saved on this iPhone · review to retry" : "Couldn’t respond · refresh and try again"
        }
    }
}
