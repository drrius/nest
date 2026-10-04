import Foundation

extension SessionModel {
    func refreshMealLibrary() async {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { return }
        let attempt = generation
        let request = UUID()
        mealLibraryRequest = request
        mealLibrary = .loading
        mealLibraryNotice = nil
        mealLibraryFresh = false
        savedRecipeRequest = UUID()
        savedRecipe = .idle
        savedRecipeNotice = nil
        savedRecipeFresh = false
        savedRecipeRevision = nil
        do {
            let pending = try await readLibraryPending()
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            recipeCreation = pending.0
            recipeArchive = pending.1
            recipeEdit = pending.2
            let cachedLibrary = try await cachedRecipeRead(.library(member), generation: attempt)
            if let cached = cachedLibrary {
                guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
                mealLibrary = .loaded(cached.value)
                mealLibraryNotice = cached.notice
            }
            let loaded = try await loadRecipeRead(.library(member), generation: attempt) {
                let session = try await auth.session()
                guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
                let first = MealLibraryListing(page: try await api.library(token: session.accessToken, member: member))
                return try cachedLibrary?.value.retainingVisitedPages(afterRefreshing: first) ?? first
            }
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            mealLibrary = .loaded(loaded.value)
            mealLibraryNotice = loaded.notice
            mealLibraryFresh = loaded.fresh
        } catch {
            await handleMealLibraryFailure(
                error, api: api, auth: auth, member: member,
                attempt: attempt, request: request, initial: true)
        }
    }

    private func readLibraryPending() async throws -> (SavedRecipeCreation?, SavedRecipeArchive?, SavedRecipeEdit?) {
        guard let offline, let lease else { return (nil, nil, nil) }
        let creation = try await offline.readRecipeCreation(lease: lease)
        let archive = try await offline.readRecipeArchive(lease: lease)
        let edit = try await offline.readRecipeEdit(lease: lease)
        return (creation, archive, edit)
    }

    func loadNextMealLibraryPage() async {
        guard case .loaded(let listing) = mealLibrary, let after = listing.nextAfterId,
            let auth, let api = mealAPI, case .ready(let member) = status
        else { return }
        let attempt = generation
        let request = UUID()
        mealLibraryRequest = request
        mealLibraryNotice = nil
        mealLibraryFresh = false
        do {
            let loaded = try await loadRecipeRead(.library(member), generation: attempt) {
                let session = try await auth.session()
                guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
                let page = try await api.library(
                    token: session.accessToken, member: member, after: after, revision: listing.revision)
                return try listing.appending(page)
            }
            guard currentMealLibraryRequest(request, member: member, attempt: attempt) else { return }
            mealLibrary = .loaded(loaded.value)
            mealLibraryNotice = loaded.notice
            mealLibraryFresh = loaded.fresh
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
        savedRecipeNotice = nil
        savedRecipeFresh = false
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
            let target = RecipeReadTarget<SavedRecipe?>.recipe(member, id: id, revision: listing.revision)
            try await showCachedSavedRecipe(target, request: request, revision: listing.revision, attempt: attempt)
            let loaded = try await loadRecipeRead(target, generation: attempt) {
                let session = try await auth.session()
                guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
                return try await api.recipe(
                    token: session.accessToken, member: member, id: id, revision: listing.revision)
            }
            guard generation == attempt, status == .ready(member),
                savedRecipeRequest == request,
                savedRecipeLibraryIsCurrent(listing.revision)
            else { return }
            savedRecipeRevision = loaded.value == nil ? nil : listing.revision
            savedRecipe = loaded.value.map(SavedRecipeStatus.loaded) ?? .missing
            savedRecipeNotice = loaded.notice
            savedRecipeFresh = loaded.fresh
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

    private func showCachedSavedRecipe(
        _ target: RecipeReadTarget<SavedRecipe?>, request: UUID, revision: String, attempt: Int
    ) async throws {
        guard let cached = try await cachedRecipeRead(target, generation: attempt),
            generation == attempt, status == .ready(target.member), savedRecipeRequest == request,
            savedRecipeLibraryIsCurrent(revision)
        else { return }
        savedRecipe = cached.value.map(SavedRecipeStatus.loaded) ?? .missing
        savedRecipeNotice = cached.notice
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
