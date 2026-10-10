import Foundation

struct MemoryContext {
    let account: AssistantContext
    let lease: OfflineLease
}

extension SessionModel {
    func memoryContext() throws -> MemoryContext {
        let account = try assistantContext()
        guard let lease, lease.actor == account.member.userId, lease.household == account.member.householdId else {
            throw NestAPIFailure.configuration
        }
        return MemoryContext(account: account, lease: lease)
    }

    func savedMemoryRequest(_ context: MemoryContext) async throws -> SavedMemoryRequest? {
        try requireAssistantAccount(context.account)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readMemoryRequest(lease: context.lease)
        try requireAssistantAccount(context.account)
        return saved
    }

    func stageMemoryProposal(_ command: ProposeMemory, context: MemoryContext) async throws {
        let current = try await readMemories(context.account)
        guard (current.memories.first { $0.id == command.memoryId }?.revision ?? "0") == command.expectedRevision else {
            throw NestAPIFailure.conflict
        }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageMemoryRequest(.proposal(command), lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func stageMemoryRemoval(_ command: RemoveMemory, context: MemoryContext) async throws {
        let current = try await readMemories(context.account)
        guard current.memories.contains(where: { $0.id == command.memoryId && $0.revision == command.expectedRevision })
        else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.stageMemoryRequest(.removal(command), lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func importMemoryProposal(id: UUID, context: MemoryContext) async throws {
        let envelope = try await readMemoryApproval(context.account, id: id)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.importMemoryProposal(envelope, lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func decideSavedMemory(approved: Bool, context: MemoryContext) async throws {
        guard let saved = try await savedMemoryRequest(context), case .proposal(let expected) = saved.response else {
            throw OfflineFailure.invalidOperation
        }
        let current = try await readMemoryApproval(context.account, id: expected.approval.id)
        guard current.approval.hasSameTerms(as: expected.approval), current.approval.canDecide()
        else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.decideSavedMemoryProposal(approved: approved, approval: current, lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func refreshSavedMemoryProposal(_ context: MemoryContext) async throws {
        guard let saved = try await savedMemoryRequest(context), case .proposal(let expected) = saved.response else {
            return
        }
        let current = try await readMemoryApproval(context.account, id: expected.approval.id)
        guard current.approval.hasSameTerms(as: expected.approval) else { throw NestAPIFailure.conflict }
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.refreshMemoryProposal(current, lease: context.lease)
        try requireAssistantAccount(context.account)
    }

    func retryMemoryRequest(_ context: MemoryContext) async throws {
        guard let saved = try await savedMemoryRequest(context), saved.response == nil, !saved.rejected,
            let offline, let assistantAPI
        else { throw OfflineFailure.invalidOperation }
        let token = try await assistantToken(context.account)
        do {
            let response = try await assistantAPI.sendMemoryRequest(
                saved.request, token: token, member: context.account.member)
            try requireAssistantAccount(context.account)
            try await offline.recordMemoryResponse(response, lease: context.lease)
            try requireAssistantAccount(context.account)
        } catch {
            try requireAssistantAccount(context.account)
            if let failure = error as? NestAPIFailure, [.conflict, .invalid].contains(failure) {
                try await offline.rejectMemoryRequest(operation: saved.request.operation, lease: context.lease)
            }
            throw error
        }
    }

    func finishMemoryRequest(_ context: MemoryContext) async throws {
        guard let saved = try await savedMemoryRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishMemoryRequest(operation: saved.request.operation, lease: context.lease)
        try requireAssistantAccount(context.account)
    }
}

extension AssistantAPI {
    func sendMemoryRequest(_ request: MemoryRequest, token: String, member: VerifiedMember) async throws
        -> MemoryResponse
    {
        switch request {
        case .proposal(let command):
            .proposal(try await proposeMemory(token: token, member: member, command: command))
        case .decision(let command):
            .decision(try await decideMemory(token: token, member: member, command: command))
        case .removal(let command):
            .removal(try await removeMemory(token: token, member: member, command: command))
        }
    }
}
