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
        } else {
            householdActionPart(part)
        }
    }

    @ViewBuilder
    private func householdActionPart(_ part: [String: AssistantJSON]) -> some View {
        if let receipt = AssistantMealPreparationLink.receipt(part, member: member) {
            Text("Meal preparation saved.")
            NavigationLink("View current preparation") {
                MealPreparationScreen(
                    model: session, target: PlannedRecipeTarget(start: receipt.weekStart, id: receipt.entryId)
                )
                .id(session.generation)
            }
        } else if let result = AssistantRenewalLink.read(part, member: member) {
            AssistantRenewalRow(session: session, member: member, result: result)
        } else if let receipt = AssistantChoreReminderLink.receipt(part, member: member) {
            Text("Chore reminder choices saved. This does not confirm delivery.")
            NavigationLink("View current chore reminder choices") {
                ChoreReminderScreen(session: session, member: member, occurrenceId: receipt.reminder.occurrenceId)
                    .id(session.generation)
            }
        } else if let summary = AssistantSummaryLink.read(part, member: member) {
            AssistantSummaryRow(session: session, member: member, summary: summary)
        } else if let receipt = AssistantMealReminderLink.receipt(part, member: member) {
            Text("Meal reminder choices saved. This does not confirm delivery.")
            NavigationLink("View current meal reminder choices") {
                MealReminderScreen(session: session, member: member, entryId: receipt.reminder.entryId)
                    .id(session.generation)
            }
        } else if let notice = AssistantActionNotice.text(part) {
            Text(notice).font(.footnote).foregroundStyle(QuietPalette.ink)
        } else if let receipt = AssistantGroceryReminderLink.receipt(part, member: member) {
            Text("Grocery reminder choices saved. This does not confirm delivery.")
            NavigationLink("View current grocery reminder choices") {
                GroceryReminderScreen(session: session, member: member, itemId: receipt.reminder.itemId)
                    .id(session.generation)
            }
        } else if let receipt = AssistantRecurringReminderLink.receipt(part, member: member) {
            Text("Bill reminder choices saved. This does not confirm delivery or approve the bill.")
            NavigationLink("View current bill reminder choices") {
                RecurringReminderScreen(session: session, member: member, ruleId: receipt.reminder.ruleId)
                    .id(session.generation)
            }
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
