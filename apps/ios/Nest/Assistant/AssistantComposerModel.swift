import SwiftUI

@MainActor
final class AssistantComposerModel: ObservableObject {
    private var live = AssistantLiveText()
    @Published var text = ""
    @Published private(set) var reply = ""
    @Published private(set) var saved: SavedAssistantTurn?
    @Published private(set) var busy = false
    @Published private(set) var notice: String?

    func load(session: SessionModel) async {
        do { saved = try await session.savedAssistantTurn(session.assistantTurnContext()) } catch {
            saved = nil
            reply = ""
            notice = "Could not check your saved request. Try again."
        }
    }

    func send(session: SessionModel, conversation: UUID, retry: Bool = false) async {
        guard !busy else { return }
        busy = true
        notice = nil
        reply = ""
        live = AssistantLiveText()
        defer { busy = false }
        do {
            let context = try session.assistantTurnContext()
            if !retry {
                let transcript = try await session.readConversation(context.account, id: conversation)
                try await session.stageAssistantTurn(
                    .init(
                        conversationId: conversation, operationId: UUID(),
                        expectedRevision: transcript.conversation?.revision ?? "0", text: text), context: context)
                text = ""
            }
            saved = try await session.savedAssistantTurn(context)
            guard saved?.command.conversationId == conversation else { throw NestAPIFailure.conflict }
            try await session.sendSavedAssistantTurn(context) { [weak self] frame in
                guard let self else { throw CancellationError() }
                try self.live.consume(frame)
                self.reply = self.live.text
            }
            saved = try await session.savedAssistantTurn(context)
            notice =
                saved?.terminal == true
                ? terminalNotice
                : "Still working. Check status shortly."
        } catch AssistantAvailabilityFailure.disabled {
            notice = "Nest’s assistant is not available yet. Your message has not been sent."
        } catch {
            await load(session: session)
            notice =
                saved == nil
                ? "Could not send. Your message is still here; try again online."
                : "The connection ended before confirmation. Check status before retrying the saved request."
        }
    }

    func recover(session: SessionModel, interrupt: Bool = false) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            saved = try await session.recoverAssistantTurn(session.assistantTurnContext(), interrupt: interrupt)
            notice =
                saved?.terminal == true
                ? terminalNotice
                : "Still working. Check again shortly."
        } catch {
            notice = "Could not confirm this request. It remains saved; try again online."
        }
    }

    private var terminalNotice: String {
        saved?.result?.turn.state == .completed
            ? "Reply saved. Open the conversation to read all action results."
            : "The reply was interrupted. Open the conversation to check any saved actions before sending again."
    }

    func acknowledge(session: SessionModel) async {
        guard !busy, let saved, saved.terminal else { return }
        do {
            try await session.finishAssistantTurn(session.assistantTurnContext(), operation: saved.command.operationId)
            self.saved = nil
            reply = ""
            notice = nil
        } catch { notice = "Could not clear the finished request. Try again." }
    }
}
