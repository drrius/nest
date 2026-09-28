import SwiftUI

struct AssistantComposerScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let conversation: UUID
    @StateObject private var model = AssistantComposerModel()
    @State private var operation: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Private to you").font(.caption).foregroundStyle(QuietPalette.muted)
                if let saved = model.saved {
                    recovery(saved)
                } else {
                    TextField("What would help today?", text: $model.text, axis: .vertical)
                        .lineLimit(3...8).padding(16)
                        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 16))
                        .accessibilityLabel("Message to Nest")
                    Button("Send", systemImage: "arrow.up") {
                        operation = Task { await model.send(session: session, conversation: conversation) }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        model.busy || model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || model.text.utf16.count > 2_000)
                    if model.text.utf16.count > 2_000 { Text("Please shorten your message to 2,000 characters.") }
                }
                if model.busy { ProgressView("Working…") }
                if !model.reply.isEmpty { Text(model.reply).textSelection(.enabled) }
                if let notice = model.notice { Text(notice).foregroundStyle(QuietPalette.muted) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }
        .background(QuietPalette.background).navigationTitle("Ask Nest")
        .task { await model.load(session: session) }
        .onDisappear { operation?.cancel() }
    }

    @ViewBuilder
    private func recovery(_ saved: SavedAssistantTurn) -> some View {
        Text(saved.command.text).textSelection(.enabled)
        NavigationLink("Open conversation") {
            AssistantHistoryScreen(session: session, member: member, conversationId: saved.command.conversationId)
        }.frame(minHeight: 44)
        if saved.terminal {
            Button("Done") { operation = Task { await model.acknowledge(session: session) } }
        } else {
            Button("Check status") { operation = Task { await model.recover(session: session) } }
            Button(saved.cancellationRequested == true ? "Retry cancellation" : "Cancel if not started") {
                operation = Task { await model.cancel(session: session) }
            }.disabled(model.busy)
            if saved.command.conversationId == conversation && saved.cancellationRequested != true {
                Button("Retry saved request") {
                    operation = Task { await model.send(session: session, conversation: conversation, retry: true) }
                }
            }
            if let deadline = saved.result.flatMap({ AssistantTimestamp.date($0.turn.deadline) }), deadline <= Date() {
                Button("Finish interrupted request") {
                    operation = Task { await model.recover(session: session, interrupt: true) }
                }
            }
        }
    }
}
