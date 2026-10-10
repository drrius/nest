import SwiftUI

struct ProposalDiscardControls: View {
    @ObservedObject var model: SessionModel
    let context: ProposalContext
    let busy: Bool
    let updated: (ProposalContext) -> Void
    @State private var working = false
    @State private var confirming = false
    @State private var notice: String?

    var body: some View {
        Group {
            if let discard = context.discard {
                if discard.state == .conflict {
                    Text("The plan changed before it could be discarded. Refresh it before deciding again.")
                    Button("Clear rejected discard") { Task { await run(.clear) } }
                } else {
                    Text("Your discard request is saved. Check its result before making another change.")
                    Button("Check discard") { Task { await run(.retry) } }
                }
            } else if context.approval == nil, context.edit == nil, let proposal = context.saved?.envelope?.proposal {
                if proposal.status == .approved || proposal.status == .discarded {
                    Button("Close this plan") { Task { await run(.close) } }
                } else {
                    Button("Discard plan", role: .destructive) { confirming = true }
                }
            }
            if let notice { Text(notice).font(.footnote).foregroundStyle(QuietPalette.muted) }
            if working { ProgressView("Checking discard…") }
        }
        .disabled(busy || working)
        .confirmationDialog("Discard this private plan?", isPresented: $confirming) {
            Button("Discard plan", role: .destructive) { Task { await run(.discard) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your saved household meals and groceries will stay as they are.")
        }
    }

    private enum Action { case discard, retry, clear, close }
    private func run(_ action: Action) async {
        guard !busy, !working else { return }
        working = true
        notice = nil
        defer { working = false }
        do {
            try model.requireProposalContext(context)
            switch action {
            case .discard:
                try await model.stageProposalDiscard(context)
                updated(try await model.retryProposalDiscard(context))
            case .retry: updated(try await model.retryProposalDiscard(context))
            case .clear:
                _ = try await model.discardProposalDiscardConflict(context)
                updated(try await model.refreshProposalContext(context))
            case .close: updated(try await model.closeTerminalProposal(context))
            }
        } catch {
            guard model.generation == context.generation else { return }
            if let cached = try? await model.cachedProposalContext() { updated(cached) }
            notice = "Could not finish. Your request is kept so you can check again when connected."
        }
    }
}
