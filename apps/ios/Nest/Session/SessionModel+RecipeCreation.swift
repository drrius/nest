import Foundation

struct RecipeCreateContext {
    let member: VerifiedMember
    let generation: Int
    let revision: String
}

extension SessionModel {
    func loadRecipeCreateContext() async throws -> RecipeCreateContext {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        let page = try await api.library(token: session.accessToken, member: member)
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        return RecipeCreateContext(member: member, generation: attempt, revision: page.revision)
    }

    func createRecipe(_ recipe: RecipeDraft, context: RecipeCreateContext) async -> Bool {
        guard let offline, let lease, generation == context.generation, status == .ready(context.member)
        else { return false }
        do {
            _ = try await requireMealLibraryOnline(
                revision: context.revision, member: context.member, attempt: context.generation)
            let command = CreateRecipe(operationId: UUID(), expectedRevision: context.revision, recipe: recipe)
            try await offline.enqueueRecipeCreation(command, lease: lease)
            let pending = try await offline.readRecipeCreation(lease: lease)
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeCreation = pending
            await retryRecipeCreation()
            return generation == context.generation && status == .ready(context.member)
        } catch {
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeCreationNotice = "Could not save this recipe. Refresh the library and try again."
            return false
        }
    }

    func retryRecipeCreation() async {
        guard recipeCreationSavingGeneration != generation, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        recipeCreationSavingGeneration = attempt
        recipeCreationSaving = true
        defer {
            if recipeCreationSavingGeneration == attempt {
                recipeCreationSavingGeneration = nil
                recipeCreationSaving = false
            }
        }
        do {
            guard let saved = try await offline.readRecipeCreation(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.createRecipe(
                    token: session.accessToken, member: member, command: saved.command)
                try await offline.acknowledgeRecipeCreation(receipt, lease: lease)
            }
            try await reconcileCreatedRecipe(token: session.accessToken, member: member, attempt: attempt)
        } catch { await handleRecipeCreationFailure(error, member: member, attempt: attempt) }
    }

    private func reconcileCreatedRecipe(token: String, member: VerifiedMember, attempt: Int) async throws {
        guard let offline, let lease, let api = mealAPI else { return }
        guard let acknowledged = try await offline.readRecipeCreation(lease: lease), let receipt = acknowledged.receipt
        else { return }
        guard generation == attempt, status == .ready(member) else { return }
        recipeCreation = acknowledged
        let page = try await api.library(token: token, member: member)
        let recipe = try await api.recipe(
            token: token, member: member,
            id: receipt.definitionId, revision: page.revision)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.reconcileRecipeCreation(
            SavedRecipeEnvelope(
                version: 1,
                householdId: member.householdId, revision: page.revision, recipe: recipe), lease: lease)
        let current = try await offline.readRecipeCreation(lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        recipeCreation = current
        recipeCreationNotice = nil
        await refreshMealLibrary()
    }

    func discardRecipeCreationConflict() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedRecipeCreation(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            recipeCreation = nil
            recipeCreationNotice = nil
            await refreshMealLibrary()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            recipeCreationNotice = "Could not discard this rejected save. Try again."
        }
    }

    private func handleRecipeCreationFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
        guard generation == attempt, status == .ready(member) else { return }
        switch error as? NestAPIFailure {
        case .signedOut, .notMember:
            await leaveMealAccount(state(for: error))
            return
        case .forbidden:
            if let api = mealAPI, let auth,
                await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
            {
                return
            }
        case .conflict, .invalid, .removed, .cutover:
            if let offline, let lease,
                let pending = try? await offline.readRecipeCreation(lease: lease), pending.state == .pending
            {
                try? await offline.conflictRecipeCreation(pending.command.operationId, lease: lease)
                let saved = try? await offline.readRecipeCreation(lease: lease)
                guard generation == attempt, status == .ready(member) else { return }
                recipeCreation = saved
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        recipeCreationNotice = "Could not finish saving. Review the saved request and retry when online."
    }
}
