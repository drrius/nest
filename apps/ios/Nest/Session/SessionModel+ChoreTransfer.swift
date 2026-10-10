import Foundation

extension SessionModel {
    func savedChoreTransfer(_ context: RoutineCreateContext) async throws -> SavedChoreTransfer? {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readChoreTransfer(lease: context.lease)
        try requireRoutineAccount(context)
        return saved
    }

    func retryChoreTransfer(_ context: RoutineCreateContext) async throws -> SavedChoreTransfer {
        guard let saved = try await savedChoreTransfer(context), let chores, let offline else {
            throw OfflineFailure.invalidOperation
        }
        if saved.receipt != nil || saved.conflicted { return saved }
        let token = try await routineToken(context)
        do {
            let receipt = try await sendTransfer(saved.command, api: chores, token: token, member: context.member)
            try requireRoutineAccount(context)
            try await offline.acknowledgeChoreTransfer(receipt, lease: context.lease)
        } catch {
            try requireRoutineAccount(context)
            guard error as? NestAPIFailure == .conflict else { throw error }
            try await offline.conflictChoreTransfer(operation: saved.command.operationId, lease: context.lease)
        }
        guard let result = try await savedChoreTransfer(context) else { throw OfflineFailure.invalidOperation }
        return result
    }

    func finishChoreTransfer(_ context: RoutineCreateContext, operation: UUID) async throws {
        try requireRoutineAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        try await offline.finishChoreTransfer(operation: operation, lease: context.lease)
        try requireRoutineAccount(context)
        await refreshToday()
    }
    private func sendTransfer(
        _ command: SavedTransferCommand, api: ChoreAPI, token: String, member: VerifiedMember
    ) async throws -> ChoreTransferReceipt {
        switch command {
        case .request(let request): return try await api.requestTransfer(token: token, member: member, command: request)
        case .respond(let response, let pending):
            return try await api.respondTransfer(token: token, member: member, command: response, pending: pending)
        }
    }

}
