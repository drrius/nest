import Foundation

struct RecipeArchiveContext {
    let member: VerifiedMember
    let generation: Int
    let revision: String
    let recipe: SavedRecipe
}

extension SessionModel {
    func loadRecipeArchiveContext(_ id: UUID) async throws -> RecipeArchiveContext {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { throw NestAPIFailure.signedOut }
        let attempt = generation
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        let page = try await api.library(token: session.accessToken, member: member)
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        guard
            let recipe = try await api.recipe(
                token: session.accessToken, member: member, id: id, revision: page.revision)
        else { throw NestAPIFailure.removed }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        return RecipeArchiveContext(member: member, generation: attempt, revision: page.revision, recipe: recipe)
    }

    func archiveRecipe(context: RecipeArchiveContext) async -> Bool {
        guard let offline, let lease, generation == context.generation, status == .ready(context.member)
        else { return false }
        do {
            try await requireCurrentRecipe(context)
            let command = ArchiveRecipe(
                operationId: UUID(), definitionId: context.recipe.id, expectedRevision: context.revision)
            try await offline.enqueueRecipeArchive(command, lease: lease)
            let pending = try await offline.readRecipeArchive(lease: lease)
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeArchive = pending
            await retryRecipeArchive()
            return generation == context.generation && status == .ready(context.member)
        } catch {
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeArchiveNotice = "Could not archive this recipe. Refresh the library and try again."
            return false
        }
    }

    func retryRecipeArchive() async {
        guard recipeArchiveSavingGeneration != generation, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        recipeArchiveSavingGeneration = attempt
        recipeArchiveSaving = true
        defer {
            if recipeArchiveSavingGeneration == attempt {
                recipeArchiveSavingGeneration = nil
                recipeArchiveSaving = false
            }
        }
        do {
            guard let saved = try await offline.readRecipeArchive(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.archiveRecipe(
                    token: session.accessToken, member: member, command: saved.command)
                try await offline.acknowledgeRecipeArchive(receipt, lease: lease)
            }
            try await reconcileArchivedRecipe(token: session.accessToken, member: member, attempt: attempt)
        } catch { await handleRecipeArchiveFailure(error, member: member, attempt: attempt) }
    }

    private func reconcileArchivedRecipe(token: String, member: VerifiedMember, attempt: Int) async throws {
        guard let offline, let lease, let api = mealAPI else { return }
        guard let acknowledged = try await offline.readRecipeArchive(lease: lease), let receipt = acknowledged.receipt
        else { return }
        guard generation == attempt, status == .ready(member) else { return }
        recipeArchive = acknowledged
        let page = try await api.library(token: token, member: member)
        let recipe = try await api.recipe(
            token: token, member: member,
            id: receipt.definitionId, revision: page.revision)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.reconcileRecipeArchive(
            SavedRecipeEnvelope(
                version: 1,
                householdId: member.householdId, revision: page.revision, recipe: recipe), lease: lease)
        let current = try await offline.readRecipeArchive(lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        recipeArchive = current
        recipeArchiveNotice = nil
        await refreshMealLibrary()
    }

    func discardRecipeArchiveConflict() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedRecipeArchive(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            recipeArchive = nil
            recipeArchiveNotice = nil
            await refreshMealLibrary()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            recipeArchiveNotice = "Could not discard this rejected archive. Try again."
        }
    }

    private func handleRecipeArchiveFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
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
                let pending = try? await offline.readRecipeArchive(lease: lease), pending.state == .pending
            {
                try? await offline.conflictRecipeArchive(pending.command.operationId, lease: lease)
                let saved = try? await offline.readRecipeArchive(lease: lease)
                guard generation == attempt, status == .ready(member) else { return }
                recipeArchive = saved
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        recipeArchiveNotice = "Could not finish archiving. Review the saved request and retry when online."
    }
}
