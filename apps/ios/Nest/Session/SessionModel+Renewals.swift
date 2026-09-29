import Foundation

struct RenewalContext {
    let member: VerifiedMember
    let generation: Int
    let lease: OfflineLease
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
}
