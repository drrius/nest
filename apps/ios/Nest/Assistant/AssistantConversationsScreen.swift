import SwiftUI

struct AssistantConversationsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var newConversation = UUID()
    @State private var rows: [AssistantConversationSummary] = []
    @State private var next: UUID?
    @State private var loading = false
    @State private var loaded = false
    @State private var notice: String?

    @State private var route: AssistantRoute?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(spacing: 10) {
                    NestArt(width: 130)
                    Text("What can I take off your plate?")
                        .font(.title2.weight(.bold)).foregroundStyle(NestColor.ink).multilineTextAlignment(.center)
                    NestPill(text: "Private · your partner can’t read these chats", systemImage: "lock.fill")
                }
                .frame(maxWidth: .infinity)
                Button {
                    startChat(nil)
                } label: {
                    HStack {
                        Text("Ask Nest anything").foregroundStyle(NestColor.ink3)
                        Spacer()
                        Image(systemName: "arrow.up").font(.footnote.weight(.bold)).foregroundStyle(NestColor.onAccent)
                            .frame(width: 34, height: 34).background(NestColor.accent, in: Circle())
                    }
                    .padding(.leading, 18).padding(.trailing, 8)
                    .frame(minHeight: 52)
                    .background(NestColor.card, in: Capsule())
                    .shadow(color: .black.opacity(0.05), radius: 10, y: 5)
                }
                .buttonStyle(NestPressStyle())
                .accessibilityLabel("Ask Nest")
                suggestions
                recent
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 32)
        }
        .nestScreen()
        .nestRootChrome("Ask Nest", session: session, member: member)
        .navigationDestination(item: $route) { route in
            switch route {
            case .compose(let prompt):
                AssistantComposerScreen(
                    session: session, member: member, conversation: newConversation, prompt: prompt)
            }
        }
        .task { await load(more: false) }
        .refreshable { await load(more: false) }
    }

    /// Every new ask is its own conversation.
    private func startChat(_ prompt: String?) {
        newConversation = UUID()
        route = .compose(prompt)
    }

    private var suggestions: some View {
        VStack(spacing: 10) {
            suggestion("🍽️", .meal, "Plan dinners for next week")
            suggestion("🛒", .groceries, "Add milk, eggs and bread to the list")
            suggestion("🧾", .money, "I paid 62.40 at Coop, split it")
            suggestion("🗓️", .calendar, "When are we both free this weekend?")
        }
    }

    private func suggestion(_ emoji: String, _ domain: NestDomain, _ text: String) -> some View {
        Button {
            startChat(text)
        } label: {
            HStack(spacing: 12) {
                EmojiTile(emoji: emoji, size: 38, domain: domain)
                Text(text).foregroundStyle(NestColor.ink).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
            }
            .padding(12)
            .nestCard(padding: 0, radius: 20)
        }
        .buttonStyle(NestPressStyle())
    }

    @ViewBuilder private var recent: some View {
        if !rows.isEmpty || notice != nil {
            VStack(alignment: .leading, spacing: 10) {
                NestSectionHeader(title: "Recent chats")
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                        if index > 0 { NestRowDivider(leading: 16) }
                        NavigationLink {
                            AssistantHistoryScreen(session: session, member: member, conversationId: row.id)
                        } label: {
                            HStack {
                                Text(
                                    AssistantTimestamp.date(row.createdAt).map {
                                        $0.formatted(.dateTime.weekday(.wide).hour().minute())
                                    } ?? "Conversation"
                                )
                                .foregroundStyle(NestColor.ink)
                                Spacer()
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                                    .foregroundStyle(NestColor.ink3)
                            }
                            .padding(.horizontal, 16).frame(minHeight: 50).contentShape(Rectangle())
                        }
                        .buttonStyle(NestPressStyle())
                        .accessibilityIdentifier("assistant-conversation-\(row.id.uuidString.lowercased())")
                    }
                    if next != nil {
                        Button("Load more") { Task { await load(more: true) } }.disabled(loading)
                            .frame(minHeight: 44)
                    }
                }
                .nestCard(padding: 0)
                if let notice { TodayForYouRetry(text: notice) { Task { await load(more: false) } } }
            }
        }
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

enum AssistantRoute: Hashable {
    case compose(String?)
}
