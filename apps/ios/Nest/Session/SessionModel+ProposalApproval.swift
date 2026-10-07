import Foundation

extension SessionModel {
    func stageProposalApproval(_ context: ProposalContext) async throws {
        try requireProposalContext(context)
        guard let offline, let lease, let preview = context.saved?.envelope else {
            throw OfflineFailure.missingSnapshot
        }
        guard let auth, let api = proposalAPI else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        try requireProposalContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let current = try await api.recover(
            token: session.accessToken, member: context.member, id: preview.proposal.id)
        try requireProposalContext(context)
        guard current == preview, current.proposal.status == .ready,
            current.proposal.expiresAt > Int64(Date().timeIntervalSince1970 * 1_000)
        else { throw NestAPIFailure.conflict }
        try await offline.enqueueProposalApproval(preview: preview, operation: UUID(), lease: lease)
        try requireProposalContext(context)
    }

    func retryProposalApproval(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let auth, let api = proposalAPI, let offline, let lease,
            let saved = try await offline.readProposalApproval(lease: lease), saved.state != .conflict
        else { throw OfflineFailure.invalidOperation }
        do {
            let session = try await auth.session()
            try requireProposalContext(context)
            guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
            if saved.state == .pending {
                let receipt = try await api.approve(
                    token: session.accessToken, member: context.member,
                    proposal: saved.preview.proposal, command: saved.command)
                try requireProposalContext(context)
                try await offline.acknowledgeProposalApproval(receipt, lease: lease)
                try requireProposalContext(context)
            }
            _ = try await refreshProposalContext(context)
            try requireProposalContext(context)
            try await offline.clearConfirmedProposalApproval(lease: lease)
            try requireProposalContext(context)
            return try await cachedProposalContext()
        } catch {
            try requireProposalContext(context)
            switch error as? NestAPIFailure {
            case .conflict, .invalid, .removed, .cutover:
                if let pending = try await offline.readProposalApproval(lease: lease), pending.state == .pending {
                    try await offline.conflictProposalApproval(operation: pending.command.operationId, lease: lease)
                }
            case .signedOut, .notMember:
                await leaveMealAccount(state(for: error))
            default: break
            }
            throw error
        }
    }

    func discardProposalApprovalConflict(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let offline, let lease else { throw OfflineFailure.sessionChanged }
        try await offline.discardConflictedProposalApproval(lease: lease)
        try requireProposalContext(context)
        return try await cachedProposalContext()
    }
}
