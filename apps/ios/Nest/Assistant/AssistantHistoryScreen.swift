import SwiftUI

struct AssistantHistoryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let conversationId: UUID
    @State private var transcript: AssistantTranscript?
    @State private var loaded = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                Text("Private to you").font(.caption).foregroundStyle(QuietPalette.muted)
                if let transcript {
                    ForEach(transcript.messages) { message in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(message.role == .user ? "You" : "Nest")
                                .font(.caption.weight(.semibold)).foregroundStyle(QuietPalette.muted)
                            ForEach(Array(message.parts.enumerated()), id: \.offset) { _, part in
                                messagePart(part)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 16))
                    }
                    if transcript.messages.isEmpty { Text("This conversation has no saved messages.") }
                } else if loaded {
                    Text("This conversation is no longer available.")
                } else if notice == nil {
                    ProgressView("Loading conversation…")
                }
                if let notice {
                    Text(notice).foregroundStyle(QuietPalette.muted)
                    Button("Try again") { Task { await load() } }.frame(minHeight: 44)
                }
            }.padding(20)
        }
        .background(QuietPalette.background).navigationTitle("Conversation")
        .toolbar {
            NavigationLink("Reply") {
                AssistantComposerScreen(session: session, member: member, conversation: conversationId)
            }
        }
        .task(id: conversationId) { await load() }
        .refreshable { await load() }
        .onDisappear {
            request = UUID()
            transcript = nil
        }
    }

    @ViewBuilder
    private func messagePart(_ part: [String: AssistantJSON]) -> some View {
        if part["type"] == .string("text"), let text = part["text"]?.string {
            Text(text).textSelection(.enabled).foregroundStyle(QuietPalette.ink)
        } else if let approval = PendingFinancialApproval.assistantLink(part, member: member) {
            FinancialApprovalRow(session: session, member: member, row: approval)
        } else if let id = AssistantMemoryLink.approvalId(part, member: member) {
            NavigationLink("Review private memory proposal") {
                PrivateMemoryScreen(session: session, member: member, approvalId: id).id(session.generation)
            }
        } else if let handoff = AssistantHandoff.read(part, member: member) {
            AssistantHandoffRow(session: session, member: member, handoff: handoff)
        } else if let notice = AssistantActionNotice.text(part) {
            Text(notice).font(.footnote).foregroundStyle(QuietPalette.ink)
        } else if part["type"] != .string("step-start") {
            Text("This message includes an action result that this view cannot display yet.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }

    private func load() async {
        let current = UUID()
        request = current
        transcript = nil
        loaded = false
        notice = nil
        do {
            let context = try session.assistantContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let value = try await session.readConversation(context, id: conversationId)
            guard request == current, session.status == .ready(member) else { return }
            transcript = value.conversation
            loaded = true
        } catch {
            guard request == current, session.status == .ready(member) else { return }
            notice = "Could not load this conversation. Try again online."
        }
    }
}
