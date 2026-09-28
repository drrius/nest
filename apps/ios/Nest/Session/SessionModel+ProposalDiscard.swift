import Foundation

extension SessionModel {
    func stageProposalDiscard(_ context: ProposalContext) async throws {
        try requireProposalContext(context)
        guard let offline, let lease, let preview = context.saved?.envelope else {
            throw OfflineFailure.missingSnapshot
        }
        try await offline.enqueueProposalDiscard(preview: preview, operation: UUID(), lease: lease)
        try requireProposalContext(context)
    }

    func retryProposalDiscard(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let auth, let api = proposalAPI, let offline, let lease,
            let saved = try await offline.readProposalDiscard(lease: lease), saved.state != .conflict
        else { throw OfflineFailure.invalidOperation }
        do {
            let session = try await auth.session()
            try requireProposalContext(context)
            guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
            if saved.state == .pending {
                let receipt = try await api.discard(
                    token: session.accessToken, member: context.member,
                    command: saved.command)
                try requireProposalContext(context)
                try await offline.acknowledgeProposalDiscard(receipt, lease: lease)
                try requireProposalContext(context)
            }
            _ = try await refreshProposalContext(context)
            try requireProposalContext(context)
            try await offline.clearConfirmedProposalDiscard(lease: lease)
            try requireProposalContext(context)
            return try await cachedProposalContext()
        } catch {
            try requireProposalContext(context)
            switch error as? NestAPIFailure {
            case .conflict, .invalid, .removed, .cutover:
                if let pending = try await offline.readProposalDiscard(lease: lease), pending.state == .pending {
                    try await offline.conflictProposalDiscard(operation: pending.command.operationId, lease: lease)
                }
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    func discardProposalDiscardConflict(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let offline, let lease else { throw OfflineFailure.sessionChanged }
        try await offline.discardConflictedProposalDiscard(lease: lease)
        try requireProposalContext(context)
        return try await cachedProposalContext()
    }
}
