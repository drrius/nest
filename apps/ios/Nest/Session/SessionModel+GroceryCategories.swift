import Foundation

extension SessionModel {
    func groceryCategoryAvailable(_ id: UUID?) -> Bool {
        guard let id else { return true }
        guard case .loaded(let categories) = groceryCategoryStatus else { return false }
        return categories.contains { $0.id == id }
    }

    func refreshGroceryCategories() async {
        guard groceryCategoryLoadingGeneration != generation,
            let auth, let api = groceryAPI, case .ready(let member) = status
        else { return }
        let attempt = generation
        groceryCategoryLoadingGeneration = attempt
        groceryCategoryStatus = .loading
        defer {
            if groceryCategoryLoadingGeneration == attempt {
                groceryCategoryLoadingGeneration = nil
            }
        }
        do {
            let categories = try await loadGroceryCategories(auth: auth, api: api, member: member)
            guard generation == attempt, status == .ready(member) else { return }
            groceryCategoryStatus = .loaded(categories)
        } catch {
            await handleCategoryFailure(error, member: member, attempt: attempt)
        }
    }

    private func loadGroceryCategories(
        auth: any NestAuthentication, api: GroceryAPI, member: VerifiedMember
    ) async throws -> [GroceryCategory] {
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        return try await api.categories(token: session.accessToken, member: member).categories
    }

    private func handleCategoryFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
        guard generation == attempt, status == .ready(member) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            generation += 1
            let current = generation
            await clearPresentation()
            if generation == current { status = mapped }
        } else {
            groceryCategoryStatus = .failed
        }
    }
}
