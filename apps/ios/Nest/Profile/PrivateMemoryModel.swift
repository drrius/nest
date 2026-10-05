import Foundation
import SwiftUI

@MainActor
final class PrivateMemoryModel: ObservableObject {
    @Published private(set) var memories: [PrivateMemory] = []
    @Published private(set) var saved: SavedMemoryRequest?
    @Published private(set) var busy = false
    @Published private(set) var loaded = false
    @Published private(set) var notice: String?

    func load(session: SessionModel, member: VerifiedMember, approvalId: UUID? = nil) async {
        guard !busy else { return }
        busy = true
        memories = []
        saved = nil
        loaded = false
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            saved = try await session.savedMemoryRequest(context)
            if let approvalId, saved == nil {
                try await session.importMemoryProposal(id: approvalId, context: context)
                saved = try await session.savedMemoryRequest(context)
            }
            if let approvalId, saved?.approvalId != approvalId {
                notice = "Finish your saved memory request before opening another proposal."
            }
            try await session.refreshSavedMemoryProposal(context)
            saved = try await session.savedMemoryRequest(context)
            let result = try await session.readMemories(context.account)
            memories = result.memories
            loaded = true
        } catch {
            if session.status != .ready(member) { saved = nil }
            notice = "Could not load private memory. Connect and try again."
        }
    }

    func propose(content: String, memory: PrivateMemory?, session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { context in
            let command = ProposeMemory(
                operationId: UUID(), memoryId: memory?.id ?? UUID(),
                expectedRevision: memory?.revision ?? "0", content: content)
            try await session.stageMemoryProposal(command, context: context)
            try await session.retryMemoryRequest(context)
        }
    }

    func remove(_ memory: PrivateMemory, session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { context in
            try await session.stageMemoryRemoval(
                RemoveMemory(operationId: UUID(), memoryId: memory.id, expectedRevision: memory.revision),
                context: context)
            try await session.retryMemoryRequest(context)
        }
    }

    func decide(_ approved: Bool, session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { context in
            try await session.decideSavedMemory(approved: approved, context: context)
            try await session.retryMemoryRequest(context)
        }
    }

    func retry(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.retryMemoryRequest($0) }
    }

    func finish(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.finishMemoryRequest($0) }
        if saved == nil { await load(session: session, member: member) }
    }

    private func context(_ session: SessionModel, _ member: VerifiedMember) throws -> MemoryContext {
        let context = try session.memoryContext()
        guard context.account.member == member else { throw NestAPIFailure.signedOut }
        return context
    }

    private func perform(
        session: SessionModel, member: VerifiedMember,
        action: (MemoryContext) async throws -> Void
    ) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            do { try await action(context) } catch {
                try session.requireAssistantAccount(context.account)
                notice = "The change is not confirmed. Review the saved request before trying again."
            }
            saved = try await session.savedMemoryRequest(context)
            try await refreshConfirmedMutation(session: session, context: context)
        } catch {
            memories = []
            saved = nil
            loaded = false
            notice = "Could not access private memory. Sign in and try again."
        }
    }

    private func refreshConfirmedMutation(session: SessionModel, context: MemoryContext) async throws {
        guard let saved, saved.response != nil else { return }
        if case .proposal = saved.request { return }
        memories = []
        loaded = false
        do {
            let current = try await session.readMemories(context.account)
            memories = current.memories
            loaded = true
        } catch {
            try session.requireAssistantAccount(context.account)
            notice = "Your result is confirmed, but the current memory list could not reload. Connect and try again."
        }
    }
}
