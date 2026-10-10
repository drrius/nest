import SwiftUI

struct AssistantComposerScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let conversation: UUID
    @StateObject private var model = AssistantComposerModel()
    @State private var operation: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            if let saved = model.saved {
                recoveryContent(saved)
            } else {
                compositionContent
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.saved == nil { sendControl }
        }
        .background(QuietPalette.background).navigationTitle("Ask Nest")
        .navigationBarTitleDisplayMode(.inline)
        .task { await model.load(session: session) }
        .onDisappear { operation?.cancel() }
    }

    private var compositionContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Private to you").font(.caption).foregroundStyle(QuietPalette.muted)
            QuietTextEditor(text: $model.text, label: "Message to Nest")
                .frame(minHeight: 88, maxHeight: .infinity)
                .padding(12)
                .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 16))
                .overlay(alignment: .topLeading) {
                    if model.text.isEmpty {
                        Text("What would help today?")
                            .foregroundStyle(QuietPalette.muted)
                            .padding(.top, 20).padding(.leading, 17).padding(.trailing, 12)
                            .allowsHitTesting(false).accessibilityHidden(true)
                    }
                }
                .disabled(model.busy)
            if model.busy { ProgressView("Working…") }
            if let notice = model.notice {
                Text(notice).font(.footnote).foregroundStyle(QuietPalette.muted)
            }
        }.padding(.horizontal, 20).padding(.vertical, 12)
    }

    private var sendControl: some View {
        HStack(spacing: 12) {
            Text("\(model.text.utf16.count)/2,000")
                .font(.caption).monospacedDigit()
                .lineLimit(1).minimumScaleFactor(0.5)
                .foregroundStyle(model.text.utf16.count > 2_000 ? Color.red : QuietPalette.muted)
                .accessibilityLabel("\(model.text.utf16.count) of 2,000 characters")
            Spacer(minLength: 8)
            Button {
                operation = Task { await model.send(session: session, conversation: conversation) }
            } label: {
                Image(systemName: "arrow.up")
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }
            .accessibilityLabel("Send")
            .buttonStyle(.borderedProminent)
            .disabled(
                model.busy || model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    || model.text.utf16.count > 2_000)
        }.padding(.horizontal, 20).padding(.vertical, 8).background(QuietPalette.background)
    }

    private func recoveryContent(_ saved: SavedAssistantTurn) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Private to you").font(.caption).foregroundStyle(QuietPalette.muted)
                recovery(saved)
                if model.busy { ProgressView("Working…") }
                if !model.reply.isEmpty { Text(model.reply).textSelection(.enabled) }
                if let notice = model.notice { Text(notice).foregroundStyle(QuietPalette.muted) }
            }.frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }
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
