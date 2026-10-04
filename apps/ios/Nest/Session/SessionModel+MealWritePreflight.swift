import Foundation

extension SessionModel {
    func requireMealWeekOnline(
        start: MealWeekStart, revision: String, member: VerifiedMember, attempt: Int
    ) async throws -> MealWeekSnapshot {
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        guard let auth, let api = mealAPI else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        let current = try await api.week(token: session.accessToken, member: member, start: start)
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        guard current.revision == revision else { throw NestAPIFailure.conflict }
        return current
    }

    func requireCurrentMealWeek(_ expected: MealWeekSnapshot, member: VerifiedMember, attempt: Int) async throws {
        let current = try await requireMealWeekOnline(
            start: expected.weekStart, revision: expected.revision, member: member, attempt: attempt)
        guard current == expected else { throw NestAPIFailure.conflict }
    }

    func requireSelectedMealWeek(_ expected: MealWeekSnapshot, member: VerifiedMember, attempt: Int) async throws {
        try await requireCurrentMealWeek(expected, member: member, attempt: attempt)
        guard mealSelection == expected.weekStart else { throw OfflineFailure.sessionChanged }
    }

    func requireCurrentMealWeeks(_ context: MealMoveContext) async throws {
        try await requireCurrentMealWeek(context.source, member: context.member, attempt: context.generation)
        if context.source.weekStart != context.target.weekStart {
            try await requireCurrentMealWeek(context.target, member: context.member, attempt: context.generation)
        }
    }
}
