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
            LazyVStack(alignment: .leading, spacing: 16) {
                NestPill(text: "Only you can see this chat", systemImage: "lock.fill")
                    .frame(maxWidth: .infinity)
                if let transcript {
                    ForEach(transcript.messages) { message in
                        if message.role == .user {
                            AssistantUserBubble(text: userText(message))
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(Array(message.parts.enumerated()), id: \.offset) { _, part in
                                    assistantPart(part)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    if transcript.messages.isEmpty { Text("This conversation has no saved messages.") }
                } else if loaded {
                    Text("This conversation is no longer available.")
                } else if notice == nil {
                    ProgressView().frame(maxWidth: .infinity, minHeight: 120)
                }
                if let notice {
                    TodayForYouRetry(text: notice) { Task { await load() } }
                }
            }.padding(20)
        }
        .nestScreen().navigationTitle("Conversation").navigationBarTitleDisplayMode(.inline)
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

    private func userText(_ message: AssistantMessage) -> String {
        message.parts.compactMap { $0["type"] == .string("text") ? $0["text"]?.string : nil }.joined(separator: "\n")
    }

    @ViewBuilder
    private func assistantPart(_ part: [String: AssistantJSON]) -> some View {
        if part["type"] == .string("text"), let text = part["text"]?.string {
            Text(text).textSelection(.enabled).foregroundStyle(NestColor.ink).font(.body)
        } else {
            messagePart(part).nestCard(padding: 14, radius: 20)
        }
    }

    @ViewBuilder
    private func messagePart(_ part: [String: AssistantJSON]) -> some View {
        if part["type"] == .string("text"), let text = part["text"]?.string {
            Text(text).textSelection(.enabled).foregroundStyle(NestColor.ink)
        } else if let approval = PendingFinancialApproval.assistantLink(part, member: member) {
            FinancialApprovalRow(session: session, member: member, row: approval)
        } else if let id = AssistantMemoryLink.approvalId(part, member: member) {
            NavigationLink {
                PrivateMemoryScreen(session: session, member: member, approvalId: id).id(session.generation)
            } label: {
                QuietActionLabel("Review private memory proposal")
            }
        } else if let handoff = AssistantHandoff.read(part, member: member) {
            AssistantHandoffRow(session: session, member: member, handoff: handoff)
        } else {
            actionPart(part)
        }
    }

    @ViewBuilder
    private func actionPart(_ part: [String: AssistantJSON]) -> some View {
        if let recipe = AssistantRecipeLink.read(part, member: member) {
            AssistantRecipeRow(session: session, member: member, result: recipe)
        } else if let result = AssistantMealRecipeReplacementLink.receipt(part, member: member) {
            AssistantMealRecipeReplacementRow(session: session, result: result)
        } else if let result = AssistantMealActionLink.read(part, member: member) {
            AssistantMealActionRow(session: session, result: result)
        } else if let result = AssistantGroceryActionLink.read(part) {
            AssistantGroceryActionRow(session: session, member: member, result: result)
        } else if let receipt = AssistantRoutineLink.receipt(part, member: member) {
            AssistantRoutineRow(session: session, member: member, receipt: receipt)
        } else if let result = AssistantChoreActionLink.read(part, member: member) {
            AssistantChoreActionRow(session: session, result: result)
        } else {
            householdActionPart(part)
        }
    }

    @ViewBuilder
    private func householdActionPart(_ part: [String: AssistantJSON]) -> some View {
        if let result = AssistantPreferenceLink.read(part, member: member) {
            AssistantPreferenceRow(session: session, member: member, result: result)
        } else if let result = AssistantLegacyRecurringLink.read(part, member: member) {
            AssistantLegacyRecurringRow(session: session, member: member, result: result)
        } else {
            reminderActionPart(part)
        }
    }

    @ViewBuilder
    private func reminderActionPart(_ part: [String: AssistantJSON]) -> some View {
        if let receipt = AssistantMealPreparationLink.receipt(part, member: member) {
            Text("Meal preparation saved.")
            NavigationLink {
                MealPreparationScreen(
                    model: session, target: PlannedRecipeTarget(start: receipt.weekStart, id: receipt.entryId)
                )
                .id(session.generation)
            } label: {
                QuietActionLabel("View current preparation")
            }
        } else if let result = AssistantRenewalLink.read(part, member: member) {
            AssistantRenewalRow(session: session, member: member, result: result)
        } else if let receipt = AssistantChoreReminderLink.receipt(part, member: member) {
            Text("Chore reminder choices saved. This does not confirm delivery.")
            NavigationLink {
                ChoreReminderScreen(session: session, member: member, occurrenceId: receipt.reminder.occurrenceId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current chore reminder choices")
            }
        } else if let summary = AssistantSummaryLink.read(part, member: member) {
            AssistantSummaryRow(session: session, member: member, summary: summary)
        } else if let receipt = AssistantMealReminderLink.receipt(part, member: member) {
            Text("Meal reminder choices saved. This does not confirm delivery.")
            NavigationLink {
                MealReminderScreen(session: session, member: member, entryId: receipt.reminder.entryId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current meal reminder choices")
            }
        } else if let notice = AssistantActionNotice.text(part) {
            Text(notice).font(.footnote).foregroundStyle(NestColor.ink)
        } else if let receipt = AssistantGroceryReminderLink.receipt(part, member: member) {
            Text("Grocery reminder choices saved. This does not confirm delivery.")
            NavigationLink {
                GroceryReminderScreen(session: session, member: member, itemId: receipt.reminder.itemId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current grocery reminder choices")
            }
        } else if let receipt = AssistantRecurringReminderLink.receipt(part, member: member) {
            Text("Bill reminder choices saved. This does not confirm delivery or approve the bill.")
            NavigationLink {
                RecurringReminderScreen(session: session, member: member, ruleId: receipt.reminder.ruleId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View current bill reminder choices")
            }
        } else if part["type"] != .string("step-start") {
            Text("This message includes an action result that this view cannot display yet.")
                .font(.footnote).foregroundStyle(NestColor.ink2)
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
