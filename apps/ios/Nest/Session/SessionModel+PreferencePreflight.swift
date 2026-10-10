import Foundation

extension SessionModel {
    func preflightFoodPreferences(_ context: FoodEditContext) async throws {
        try requireFoodContext(context)
        guard context.pending == nil, let baseline = context.profile,
            let auth, let api = foodAPI, let offline, let lease
        else { throw OfflineFailure.missingSnapshot }
        guard try await offline.readFoodPreference(lease: lease) == nil else {
            throw OfflineFailure.invalidOperation
        }
        let session = try await auth.session()
        try requireFoodContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let fresh = try await api.read(token: session.accessToken, member: context.member)
        try requireFoodContext(context)
        guard fresh == baseline else { throw NestAPIFailure.conflict }
        // Do not update the editor baseline or cache: the user must explicitly reload a changed profile.
    }

    func preflightCookingPreferences(_ context: CookingEditContext) async throws {
        try requireCookingContext(context)
        guard let auth, let api = mealAPI, let offline, let lease else { throw NestAPIFailure.signedOut }
        guard try await offline.readCookingPreference(lease: lease) == nil else {
            throw OfflineFailure.invalidOperation
        }
        let session = try await auth.session()
        try requireCookingContext(context)
        guard session.userId == context.member.userId else { throw NestAPIFailure.signedOut }
        let fresh = try await api.cookingProfile(token: session.accessToken, member: context.member)
        try requireCookingContext(context)
        guard fresh == context.profile else { throw NestAPIFailure.conflict }
    }

    private func requireCookingContext(_ context: CookingEditContext) throws {
        guard generation == context.generation, status == .ready(context.member) else {
            throw OfflineFailure.sessionChanged
        }
    }
}
