import SwiftUI

struct MemoryRequestSection: View {
    @ObservedObject var model: PrivateMemoryModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let saved: SavedMemoryRequest

    var body: some View {
        Section("Your memory request") {
            if saved.rejected {
                Text("This request was rejected. The memory or approval may have changed or expired. Reload before editing.")
                Button("Dismiss rejected request") { Task { await model.finish(session: session, member: member) } }
            } else if let response = saved.response {
                result(response)
            } else {
                Text("The result is not confirmed. Retrying sends the same request.")
                Button("Retry saved request") { Task { await model.retry(session: session, member: member) } }
            }
        }
    }

    @ViewBuilder private func result(_ response: MemoryResponse) -> some View {
        switch response {
        case .proposal(let envelope):
            if [.pending, .approved].contains(envelope.approval.status) {
                Text("Review the exact text before saving it to your private memory.")
                Text(envelope.approval.change.content).textSelection(.enabled)
                Button("Save this memory") { Task { await model.decide(true, session: session, member: member) } }
                Button("Don’t save", role: .cancel) {
                    Task { await model.decide(false, session: session, member: member) }
                }
            } else {
                Text("This proposal has already been decided. Reload to see your current memory.")
                done
            }
        case .decision(let envelope):
            Text(envelope.decision.status == "consumed" ? "Memory saved." : "Memory was not saved.")
            done
        case .removal:
            Text("Memory removed. Your separate conversation and approval history remains.")
            done
        }
    }

    private var done: some View {
        Button("Done") { Task { await model.finish(session: session, member: member) } }
    }
}
