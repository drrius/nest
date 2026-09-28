import Foundation

extension SessionModel {
    func refreshMealLibrary() async {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { return }
        let attempt = generation
        let request = UUID()
        mealLibraryRequest = request
        mealLibrary = .loading
        mealLibraryNotice = nil
        savedRecipeRequest = UUID()
        savedRecipe = .idle
        savedRecipeRevision = nil
        do {
            let pending: SavedRecipeCreation?
            if let offline, let lease {
                pending = try await offline.readRecipeCreation(lease: lease)
            } else {
                pending = nil
            }
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            recipeCreation = pending
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let page = try await api.library(token: session.accessToken, member: member)
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            mealLibrary = .loaded(MealLibraryListing(page: page))
        } catch {
            await handleMealLibraryFailure(
                error, api: api, auth: auth, member: member,
                attempt: attempt, request: request, initial: true)
        }
    }

    func loadNextMealLibraryPage() async {
        guard case .loaded(let listing) = mealLibrary, let after = listing.nextAfterId,
            let auth, let api = mealAPI, case .ready(let member) = status
        else { return }
        let attempt = generation
        let request = UUID()
        mealLibraryRequest = request
        mealLibraryNotice = nil
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let page = try await api.library(
                token: session.accessToken, member: member,
                after: after, revision: listing.revision)
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            mealLibrary = .loaded(try listing.appending(page))
        } catch {
            await handleMealLibraryFailure(
                error, api: api, auth: auth, member: member,
                attempt: attempt, request: request, initial: false)
        }
    }

    func loadSavedRecipe(_ id: UUID) async {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { return }
        let request = UUID()
        savedRecipeRequest = request
        savedRecipeRevision = nil
        guard case .loaded(let listing) = mealLibrary else {
            savedRecipe = .failed
            return
        }
        guard listing.meals.contains(where: { $0.id == id }) else {
            savedRecipe = .missing
            return
        }
        let attempt = generation
        savedRecipe = .loading
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let recipe = try await api.recipe(
                token: session.accessToken, member: member,
                id: id, revision: listing.revision)
            guard generation == attempt, status == .ready(member),
                savedRecipeRequest == request,
                savedRecipeLibraryIsCurrent(listing.revision)
            else { return }
            savedRecipeRevision = recipe == nil ? nil : listing.revision
            savedRecipe = recipe.map(SavedRecipeStatus.loaded) ?? .missing
        } catch {
            await handleSavedRecipeFailure(
                error, api: api, auth: auth, member: member,
                attempt: attempt, request: request)
        }
    }

    private func savedRecipeLibraryIsCurrent(_ revision: String) -> Bool {
        guard case .loaded(let listing) = mealLibrary else { return false }
        return listing.revision == revision
    }

    private func handleSavedRecipeFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int, request: UUID
    ) async {
        guard generation == attempt, status == .ready(member),
            savedRecipeRequest == request
        else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveMealAccount(mapped)
            return
        }
        if (error as? NestAPIFailure) == .forbidden,
            await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
        {
            return
        }
        guard generation == attempt, status == .ready(member), savedRecipeRequest == request
        else { return }
        savedRecipe = .failed
    }

    private func currentMealLibraryRequest(
        _ request: UUID, member: VerifiedMember, attempt: Int
    ) -> Bool {
        generation == attempt && status == .ready(member) && mealLibraryRequest == request
    }

    private func handleMealLibraryFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int, request: UUID, initial: Bool
    ) async {
        guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveMealAccount(mapped)
            return
        }
        if (error as? NestAPIFailure) == .forbidden,
            await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
        {
            return
        }
        guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
        if initial { mealLibrary = .failed }
        mealLibraryNotice =
            (error as? NestAPIFailure) == .conflict
            ? "Saved meals changed. Refresh the library."
            : "Could not load saved meals. Try again online."
    }
}
