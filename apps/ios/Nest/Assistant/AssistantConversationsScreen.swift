import SwiftUI

struct AssistantConversationsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var rows: [AssistantConversationSummary] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var loaded = false
    @State private var notice: String?

    var body: some View {
        List {
            Section {
                Text("Your conversations are private. Your partner cannot read them.")
                    .foregroundStyle(QuietPalette.muted)
            }
            ForEach(rows) { row in
                NavigationLink {
                    AssistantHistoryScreen(session: session, member: member, conversationId: row.id)
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Conversation")
                        if let date = AssistantTimestamp.date(row.createdAt) {
                            Text(date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(QuietPalette.muted)
                        }
                    }.frame(minHeight: 44)
                }
            }
            if loaded && rows.isEmpty { Text("No saved conversations yet.") }
            if let notice { Text(notice).foregroundStyle(QuietPalette.muted) }
            if loading { ProgressView("Loading conversations…") }
            if next != nil {
                Button("Load more") { Task { await load(more: true) } }.disabled(loading)
            }
            if notice != nil { Button("Try again") { Task { await load(more: false) } }.disabled(loading) }
        }
        .navigationTitle("Private conversations")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load(more: false) }
        .refreshable { await load(more: false) }
    }

    private func load(more: Bool) async {
        guard !loading else { return }
        loading = true
        notice = nil
        defer { loading = false }
        let cursor = more ? next : nil
        if !more {
            rows = []
            next = nil
            loaded = false
        }
        do {
            let context = try session.assistantContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let page = try await session.readConversations(context, after: cursor)
            try Task.checkCancellation()
            guard page.conversations.allSatisfy({ row in !rows.contains(where: { $0.id == row.id }) }) else {
                throw NestAPIFailure.contract
            }
            rows += page.conversations
            next = page.nextCursor
            loaded = true
        } catch {
            guard !Task.isCancelled else { return }
            notice = "Could not load your conversations. Try again online."
        }
    }
}
