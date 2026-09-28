import Foundation

struct ProposalContext {
    let member: VerifiedMember
    let generation: Int
    let saved: SavedProposalGeneration?
    let approval: SavedProposalApproval?
}

extension SessionModel {
    func cachedProposalContext() async throws -> ProposalContext {
        guard case .ready(let member) = status, let offline, let lease else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let saved = try await offline.readProposalGeneration(lease: lease)
        let approval = try await offline.readProposalApproval(lease: lease)
        let context = ProposalContext(member: member, generation: attempt, saved: saved, approval: approval)
        try requireProposalContext(context)
        return context
    }

    func stageProposalGeneration(week: MealWeekSnapshot, familiarOnly: Bool, context: ProposalContext) async throws {
        try requireProposalContext(context)
        guard let offline, let lease else { throw NestAPIFailure.signedOut }
        _ = try week.validated(household: context.member.householdId, week: week.weekStart)
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: week.weekStart,
            expectedWeekRevision: week.revision, familiarOnly: familiarOnly)
        try await offline.enqueueProposalGeneration(command, lease: lease)
        try requireProposalContext(context)
    }

    func retryProposalGeneration(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let auth, let api = proposalAPI, let offline, let lease,
            let saved = try await offline.readProposalGeneration(lease: lease)
        else { throw OfflineFailure.missingSnapshot }
        let session = try await auth.session()
        try requireProposalContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.reserve(token: session.accessToken, member: context.member, command: saved.command)
        try requireProposalContext(context)
        try await offline.reserveProposalGeneration(receipt, lease: lease)
        try requireProposalContext(context)
        let result = try await api.generate(token: session.accessToken, member: context.member, command: saved.command)
        try requireProposalContext(context)
        try await offline.saveGeneratedProposal(result.envelope, lease: lease)
        try requireProposalContext(context)
        return try await cachedProposalContext()
    }

    func refreshProposalContext(_ context: ProposalContext) async throws -> ProposalContext {
        try requireProposalContext(context)
        guard let auth, let api = proposalAPI, let offline, let lease,
            let saved = try await offline.readProposalGeneration(lease: lease), let receipt = saved.receipt
        else { throw OfflineFailure.missingSnapshot }
        let session = try await auth.session()
        try requireProposalContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let fresh = try await api.recover(token: session.accessToken, member: context.member, id: receipt.proposalId)
        try requireProposalContext(context)
        try await offline.saveGeneratedProposal(fresh, lease: lease)
        try requireProposalContext(context)
        return try await cachedProposalContext()
    }

    func requireProposalContext(_ context: ProposalContext) throws {
        guard generation == context.generation, status == .ready(context.member)
        else { throw OfflineFailure.sessionChanged }
    }
}
