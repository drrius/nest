import SwiftUI

struct ProposalEditRecovery: View {
    @ObservedObject var model: SessionModel
    let context: ProposalContext
    let busy: Bool
    let updated: (ProposalContext) -> Void
    @State private var working = false
    @State private var notice: String?

    var body: some View {
        Group {
            if let edit = context.edit {
                if edit.conflict || edit.result?.status == .failed {
                    Text("This change could not be applied. Clear the request and review the current plan.")
                    Button("Clear unsuccessful change") { Task { await run(clear: true) } }
                } else {
                    Text("Your meal change is saved. Check its result before approving the plan.")
                    Button("Check meal change") { Task { await run(clear: false) } }
                }
            }
            if let notice { Text(notice).font(.footnote).foregroundStyle(QuietPalette.muted) }
            if working { ProgressView("Checking meal change…") }
        }.disabled(busy || working)
    }

    private func run(clear: Bool) async {
        guard !busy, !working else { return }
        working = true
        notice = nil
        defer { working = false }
        do {
            if clear {
                _ = try await model.clearRejectedProposalEdit(context)
                updated(try await model.refreshProposalContext(context))
            } else {
                updated(try await model.retryProposalEdit(context))
            }
        } catch {
            guard model.generation == context.generation else { return }
            if let cached = try? await model.cachedProposalContext() { updated(cached) }
            notice = "Could not finish. Your request is kept so you can check again when connected."
        }
    }
}
