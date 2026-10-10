import Foundation

extension SessionModel {
    func requireMealLibraryOnline(revision: String, member: VerifiedMember, attempt: Int) async throws -> String {
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        guard let auth, let api = mealAPI else { throw NestAPIFailure.signedOut }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        let page = try await api.library(token: session.accessToken, member: member)
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        guard page.revision == revision else { throw NestAPIFailure.conflict }
        return session.accessToken
    }

    func requireCurrentRecipe(_ context: RecipeArchiveContext) async throws {
        let token = try await requireMealLibraryOnline(
            revision: context.revision, member: context.member, attempt: context.generation)
        guard let api = mealAPI else { throw NestAPIFailure.signedOut }
        let current = try await api.recipe(
            token: token, member: context.member, id: context.recipe.id, revision: context.revision)
        guard generation == context.generation, status == .ready(context.member) else {
            throw OfflineFailure.sessionChanged
        }
        guard current == context.recipe else { throw NestAPIFailure.conflict }
    }
}
