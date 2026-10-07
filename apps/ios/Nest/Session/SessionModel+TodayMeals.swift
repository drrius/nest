import Foundation

struct TodayMealsRead {
    let week: MealWeekSnapshot
    let saved: Bool
}

extension SessionModel {
    func cachedTodayMeals(_ start: MealWeekStart, member: VerifiedMember, generation expected: Int) async throws
        -> TodayMealsRead?
    {
        guard generation == expected, status == .ready(member), let lease, let offline, let auth else {
            throw NestAPIFailure.signedOut
        }
        func requireAccount() throws {
            guard generation == expected, status == .ready(member), self.lease == lease else {
                throw NestAPIFailure.signedOut
            }
        }
        let cached = await auth.cachedSession()
        try requireAccount()
        guard cached?.userId == member.userId else { throw NestAPIFailure.signedOut }
        let week = try await offline.readMealWeek(start, lease: lease)
        try Task.checkCancellation()
        try requireAccount()
        return week.map { TodayMealsRead(week: $0, saved: true) }
    }

    /// Reads independently of the week selected in Meals; never stages or retries a mutation.
    func readTodayMeals(_ start: MealWeekStart, member: VerifiedMember) async throws -> TodayMealsRead {
        guard status == .ready(member), let lease, let offline, let auth, let mealAPI else {
            throw NestAPIFailure.signedOut
        }
        let attempt = generation
        func requireAccount() throws {
            guard generation == attempt, status == .ready(member), self.lease == lease else {
                throw NestAPIFailure.signedOut
            }
        }
        do {
            let session = try await auth.session()
            try requireAccount()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let week = try await mealAPI.week(token: session.accessToken, member: member, start: start)
            try requireAccount()
            try await offline.saveMealWeek(week, lease: lease)
            let visible = try await offline.readMealWeek(start, lease: lease) ?? week
            try requireAccount()
            return TodayMealsRead(week: visible, saved: false)
        } catch {
            try requireAccount()
            await handleTodayMealAuthorization(error, member: member, attempt: attempt)
            try requireAccount()
            guard error is URLError || (error as? NestAPIFailure) == .unavailable else { throw error }
            let cached = try await offline.readMealWeek(start, lease: lease)
            try requireAccount()
            guard let cached else { throw error }
            return TodayMealsRead(week: cached, saved: true)
        }
    }

    private func handleTodayMealAuthorization(_ error: Error, member: VerifiedMember, attempt: Int) async {
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveMealAccount(mapped)
        } else if (error as? NestAPIFailure) == .forbidden, let mealAPI, let auth {
            _ = await reverifyMealMembership(api: mealAPI, auth: auth, member: member, attempt: attempt)
        }
    }

}
