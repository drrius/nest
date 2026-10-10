import SwiftUI

struct AssistantComposerScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let conversation: UUID
    var prompt: String? = nil
    @StateObject private var model = AssistantComposerModel()
    @State private var operation: Task<Void, Never>?
    @FocusState private var typing: Bool

    var body: some View {
        VStack(spacing: 0) {
            if let saved = model.saved {
                recoveryContent(saved)
            } else {
                compositionContent
            }
        }
        .safeAreaInset(edge: .bottom) {
            if model.saved == nil { composer }
        }
        .nestScreen()
        .navigationTitle("Ask Nest")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await model.load(session: session)
            if let prompt, model.text.isEmpty, model.saved == nil { model.text = prompt }
            typing = model.saved == nil
        }
        .onDisappear { operation?.cancel() }
    }

    private var compositionContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                NestPill(text: "Private to you", systemImage: "lock.fill").frame(maxWidth: .infinity)
                Text(
                    "Ask about meals, chores, groceries, money or your calendar. Anything that changes money comes back to you to approve first."
                )
                .font(.subheadline).foregroundStyle(NestColor.ink2)
                if model.busy { AssistantTypingDots() }
                if let notice = model.notice {
                    Label(notice, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(NestColor.warn)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var composer: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if model.text.utf16.count > 1_800 {
                Text("\(model.text.utf16.count)/2,000")
                    .font(.caption).monospacedDigit()
                    .foregroundStyle(model.text.utf16.count > 2_000 ? NestColor.bad : NestColor.ink3)
                    .accessibilityLabel("\(model.text.utf16.count) of 2,000 characters")
            }
            HStack(alignment: .bottom, spacing: 8) {
                QuietTextEditor(text: $model.text, label: "Message to Nest")
                    .focused($typing)
                    .frame(minHeight: 38, maxHeight: 140)
                    .fixedSize(horizontal: false, vertical: true)
                    .overlay(alignment: .topLeading) {
                        if model.text.isEmpty {
                            Text("Ask Nest anything")
                                .foregroundStyle(NestColor.ink3)
                                .padding(.top, 8).padding(.leading, 5)
                                .allowsHitTesting(false).accessibilityHidden(true)
                        }
                    }
                    .disabled(model.busy)
                Button {
                    operation = Task { await model.send(session: session, conversation: conversation) }
                } label: {
                    Image(systemName: "arrow.up").font(.body.weight(.bold)).foregroundStyle(NestColor.onAccent)
                        .frame(width: 38, height: 38).background(NestColor.accent, in: Circle())
                }
                .buttonStyle(NestPressStyle())
                .accessibilityLabel("Send")
                .disabled(
                    model.busy || model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || model.text.utf16.count > 2_000
                )
                .opacity(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.4 : 1)
            }
            .padding(.leading, 14).padding(.trailing, 7).padding(.vertical, 7)
            .background(NestColor.card, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.08), radius: 14, y: 6)
        }
        .padding(.horizontal, 12).padding(.bottom, 8)
    }

    private func recoveryContent(_ saved: SavedAssistantTurn) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                NestPill(text: "Private to you", systemImage: "lock.fill").frame(maxWidth: .infinity)
                AssistantUserBubble(text: saved.command.text)
                if !model.reply.isEmpty {
                    Text(model.reply).textSelection(.enabled).foregroundStyle(NestColor.ink)
                        .contentTransition(.opacity)
                }
                if model.busy { AssistantTypingDots() }
                if let notice = model.notice {
                    Label(notice, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(NestColor.ink2)
                }
                recovery(saved)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .animation(.easeOut(duration: 0.2), value: model.reply)
        }
    }

    @ViewBuilder
    private func recovery(_ saved: SavedAssistantTurn) -> some View {
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

/// Three dots that breathe while Nest is thinking.
struct AssistantTypingDots: View {
    @State private var phase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { index in
                Circle().fill(NestColor.ink3).frame(width: 8, height: 8)
                    .offset(y: phase && !reduceMotion ? -3 : 0)
                    .opacity(phase || reduceMotion ? 1 : 0.35)
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 0.45).repeatForever().delay(Double(index) * 0.15),
                        value: phase)
            }
        }
        .padding(.vertical, 8)
        .onAppear { phase = true }
        .accessibilityLabel("Nest is working")
    }
}
