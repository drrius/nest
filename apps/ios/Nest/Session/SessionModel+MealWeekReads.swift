import Foundation

extension SessionModel {
    func readAndCacheMealWeek(_ start: MealWeekStart, token: String, member: VerifiedMember, generation expected: Int)
        async throws -> MealWeekSnapshot
    {
        guard generation == expected, status == .ready(member), let offline, let lease, let api = mealAPI else {
            throw NestAPIFailure.signedOut
        }
        func requireAccount() throws {
            guard generation == expected, status == .ready(member), self.lease == lease else {
                throw NestAPIFailure.signedOut
            }
        }
        let ticket = try await offline.beginMealWeekRead(start, lease: lease)
        try requireAccount()
        do {
            let week = try await api.week(token: token, member: member, start: start)
            try requireAccount()
            guard try await offline.saveMealWeekRead(week, ticket: ticket) else { throw NestAPIFailure.conflict }
            try requireAccount()
            guard try await offline.isCurrentMealWeekRead(ticket) else { throw NestAPIFailure.conflict }
            try requireAccount()
            return week
        } catch {
            try requireAccount()
            if (error as? NestAPIFailure) == .forbidden {
                try await forgetDeniedMealWeek(start, member: member, generation: expected)
            }
            throw error
        }
    }
}
