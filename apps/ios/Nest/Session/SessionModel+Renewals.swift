import Foundation

struct RenewalContext {
    let member: VerifiedMember
    let generation: Int
    let lease: OfflineLease
}

struct RenewalViewRead<Value: Sendable>: Sendable {
    let value: Value
    let notice: String?
    let fresh: Bool
    let collectionId: UUID?
}

extension SessionModel {
    func renewalContext() throws -> RenewalContext {
        guard case .ready(let member) = status, let lease,
            lease.actor == member.userId, lease.household == member.householdId
        else { throw NestAPIFailure.signedOut }
        return RenewalContext(member: member, generation: generation, lease: lease)
    }

    func requireRenewalAccount(_ context: RenewalContext) throws {
        guard generation == context.generation, status == .ready(context.member) else {
            throw NestAPIFailure.signedOut
        }
    }

    func readRenewals(_ context: RenewalContext, after: UUID?) async throws -> RenewalList {
        let token = try await renewalToken(context)
        guard let renewalAPI else { throw NestAPIFailure.configuration }
        let result = try await renewalAPI.list(token: token, member: context.member, after: after)
        try requireRenewalAccount(context)
        return result
    }

    func readRenewal(_ context: RenewalContext, id: UUID) async throws -> CalendarRenewal {
        let token = try await renewalToken(context)
        guard let renewalAPI else { throw NestAPIFailure.configuration }
        let result = try await renewalAPI.detail(token: token, member: context.member, id: id)
        try requireRenewalAccount(context)
        return result.renewal
    }

    func savedRenewalRequest(_ context: RenewalContext) async throws -> SavedRenewalCommand? {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let result = try await offline.readRenewalRequest(lease: context.lease)
        try requireRenewalAccount(context)
        return result
    }

    func renewalRoster(_ context: RenewalContext) async throws -> RoutineRoster {
        let token = try await renewalToken(context)
        guard let chores else { throw NestAPIFailure.configuration }
        let result = try await chores.routineRoster(token: token, member: context.member)
        try requireRenewalAccount(context)
        return result
    }

    func renewalExpenseChoices(_ context: RenewalContext, after: UUID?) async throws -> RecurringList {
        let token = try await renewalToken(context)
        guard let moneyAPI else { throw NestAPIFailure.configuration }
        let result = try await moneyAPI.recurringRules(
            token: token, member: context.member, after: after, dueOnly: false)
        try requireRenewalAccount(context)
        return result
    }

    func renewalToken(_ context: RenewalContext) async throws -> String {
        try requireRenewalAccount(context)
        guard let auth else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireRenewalAccount(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        return session.accessToken
    }

    func renewalDisplayMembers(_ context: RenewalContext) async throws -> [NestMember] {
        try requireRenewalAccount(context)
        let saved = try? await offline?.read(context.lease)
        try requireRenewalAccount(context)
        return saved?.snapshot.members ?? []
    }

    func loadRenewals(
        _ context: RenewalContext, after: UUID?, collection: UUID? = nil
    ) async throws -> RenewalViewRead<RenewalList> {
        try await loadRenewalView(.list(context.member, after: after), context: context, collection: collection) {
            try await self.readRenewals(context, after: after)
        }
    }

    func loadRenewal(_ context: RenewalContext, id: UUID) async throws -> RenewalViewRead<CalendarRenewal> {
        try await loadRenewalView(.detail(context.member, id: id), context: context) {
            try await self.readRenewal(context, id: id)
        }
    }

    private func loadRenewalView<Value>(
        _ target: RenewalReadTarget<Value>, context: RenewalContext, collection: UUID? = nil,
        live: () async throws -> Value
    ) async throws -> RenewalViewRead<Value> {
        try requireRenewalAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let ticket = try await offline.beginRenewalRead(target, lease: context.lease, collection: collection)
        try requireRenewalAccount(context)
        let value: Value
        do { value = try await live() } catch {
            try Task.checkCancellation()
            try requireRenewalAccount(context)
            try await handleRenewalReadDenial(error, context: context)
            guard (error as? NestAPIFailure) == .unavailable || error is URLError else { throw error }
            try await requireCachedRenewalIdentity(context)
            guard let saved = try await offline.readRenewalSnapshot(ticket) else { throw error }
            try await requireCachedRenewalIdentity(context)
            return savedRenewalView(saved)
        }
        try Task.checkCancellation()
        try await requireCachedRenewalIdentity(context)
        let stored: Bool
        do { stored = try await offline.saveRenewalRead(value, ticket: ticket, savedAt: Date()) } catch {
            try Task.checkCancellation()
            try await requireCachedRenewalIdentity(context)
            guard (error as? OfflineFailure) == .storage else { throw error }
            return RenewalViewRead(
                value: value, notice: "Loaded online, but this information could not be saved for offline viewing.",
                fresh: true, collectionId: nil)
        }
        try await requireCachedRenewalIdentity(context)
        if !stored {
            guard let newer = try await offline.readRenewalSnapshot(ticket) else { throw NestAPIFailure.conflict }
            try await requireCachedRenewalIdentity(context)
            return savedRenewalView(newer)
        }
        return RenewalViewRead(value: value, notice: nil, fresh: true, collectionId: ticket.collectionId)
    }

    private func savedRenewalView<Value>(_ saved: SavedRenewalRead<Value>) -> RenewalViewRead<Value> {
        RenewalViewRead(
            value: saved.value,
            notice:
                "Saved information from \(saved.savedAt.formatted(date: .abbreviated, time: .shortened)). Refresh when online.",
            fresh: false, collectionId: saved.collectionId)
    }

    private func requireCachedRenewalIdentity(_ context: RenewalContext) async throws {
        try requireRenewalAccount(context)
        guard let auth else { throw NestAPIFailure.configuration }
        let cached = await auth.cachedSession()
        try Task.checkCancellation()
        try requireRenewalAccount(context)
        guard cached?.userId == context.member.userId else { throw NestAPIFailure.signedOut }
    }

    private func handleRenewalReadDenial(_ error: Error, context: RenewalContext) async throws {
        guard [.signedOut, .notMember, .forbidden].contains(error as? NestAPIFailure) else { return }
        try await offline?.forgetRenewalReads(lease: context.lease)
        try requireRenewalAccount(context)
        if (error as? NestAPIFailure) != .forbidden {
            await leaveMealAccount((error as? NestAPIFailure) == .signedOut ? .signedOut : .notMember)
        }
        throw error
    }

}
