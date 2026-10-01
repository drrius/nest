import Foundation

struct MealPreparationContext {
    let member: VerifiedMember
    let generation: Int
    let baseline: MealPreparationEnvelope
    let roster: RoutineRoster
}

extension SessionModel {
    func preparationReadFailed(_ error: Error, attempt: Int) async {
        guard generation == attempt, case .ready(let member) = status else { return }
        if state(for: error) == .signedOut || state(for: error) == .notMember {
            await leaveMealAccount(state(for: error))
        } else if (error as? NestAPIFailure) == .forbidden, let api = mealAPI, let auth {
            _ = await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
        }
    }

    func loadMealPreparationContext(_ target: PlannedRecipeTarget) async throws -> MealPreparationContext {
        guard let auth, let api = mealAPI, let chores, case .ready(let member) = status else {
            throw NestAPIFailure.signedOut
        }
        let attempt = generation
        let session = try await auth.session()
        try checkPreparationScope(member, attempt: attempt)
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let week = try await api.week(token: session.accessToken, member: member, start: target.start)
        try checkPreparationScope(member, attempt: attempt)
        let value = try await api.preparation(
            token: session.accessToken, member: member, entry: target.id, week: target.start, revision: week.revision)
        try checkPreparationScope(member, attempt: attempt)
        let roster = try await chores.routineRoster(token: session.accessToken, member: member)
        try checkPreparationScope(member, attempt: attempt)
        if let offline, let lease {
            try await offline.savePreparationSnapshot(value, lease: lease)
            try checkPreparationScope(member, attempt: attempt)
        }
        return MealPreparationContext(member: member, generation: attempt, baseline: value, roster: roster)
    }

    func cachedMealPreparation(_ target: PlannedRecipeTarget) async throws -> MealPreparationEnvelope? {
        guard let offline, let lease, case .ready(let member) = status else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let value = try await offline.readPreparationSnapshot(entry: target.id, week: target.start, lease: lease)
        try checkPreparationScope(member, attempt: attempt)
        return value
    }

    func restorePreparationRecovery() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            let value = try await offline.readMealPreparation(lease: lease)
            try checkPreparationScope(member, attempt: attempt)
            mealPreparationRequest = value
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealPreparationNotice = "Could not read your saved preparation request. Try again."
        }
    }

    func checkPreparationScope(_ member: VerifiedMember, attempt: Int) throws {
        guard generation == attempt, status == .ready(member), lease?.actor == member.userId,
            lease?.household == member.householdId
        else { throw OfflineFailure.sessionChanged }
    }
}
