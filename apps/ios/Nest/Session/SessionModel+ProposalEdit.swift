import Foundation

extension SessionModel {
    func stageProposalEdit(_ command: MealProposalEditCommand, context: ProposalContext) async throws {
        try requireProposalContext(context)
        guard let offline, let lease, let preview = context.saved?.envelope else {
            throw OfflineFailure.missingSnapshot
        }
        try await offline.enqueueProposalEdit(preview: preview, command: command, lease: lease)
        try requireProposalContext(context)
    }

    func retryProposalEdit(_ context: ProposalContext, recoverOnly: Bool = false) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let auth, let api = proposalAPI, let offline, let lease,
            let saved = try await offline.readProposalEdit(lease: lease), !saved.conflict
        else { throw OfflineFailure.invalidOperation }
        do {
            let session = try await auth.session()
            try requireProposalContext(context)
            guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
            if saved.result == nil || saved.result?.status == .pending {
                let result: MealProposalEdit
                if recoverOnly {
                    result = try await api.recoverEdit(
                        token: session.accessToken, member: context.member, command: saved.command)
                } else {
                    result = try await api.edit(
                        token: session.accessToken, member: context.member, command: saved.command)
                }
                try requireProposalContext(context)
                try await offline.saveProposalEditResult(result, lease: lease)
                try requireProposalContext(context)
            }
            _ = try await refreshProposalContext(context)
            try requireProposalContext(context)
            if try await offline.readProposalEdit(lease: lease)?.result?.status == .applied {
                try await offline.clearAppliedProposalEdit(lease: lease)
            }
            try requireProposalContext(context)
            return try await cachedProposalContext()
        } catch {
            try requireProposalContext(context)
            try await handleProposalEditFailure(error, offline: offline, lease: lease)
            throw error
        }
    }

    private func handleProposalEditFailure(_ error: Error, offline: ChoreOfflineStore, lease: OfflineLease) async throws
    {
        if let failure = error as? NestAPIFailure,
            [NestAPIFailure.conflict, .invalid, .removed, .cutover].contains(failure)
        {
            if let pending = try await offline.readProposalEdit(lease: lease),
                pending.result == nil || pending.result?.status == .pending
            {
                try await offline.conflictProposalEdit(operation: pending.command.operationId, lease: lease)
            }
        } else if error as? NestAPIFailure == .signedOut || error as? NestAPIFailure == .notMember {
            await leaveMealAccount(state(for: error))
        }
    }

    func clearRejectedProposalEdit(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let offline, let lease else { throw OfflineFailure.sessionChanged }
        try await offline.clearRejectedProposalEdit(lease: lease)
        try requireProposalContext(context)
        return try await cachedProposalContext()
    }
}
