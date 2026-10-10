import Foundation

extension SessionModel {
    func refreshRecipeEditContext(
        _ draft: RecipeEditDraft, context: RecipeArchiveContext
    ) async throws -> RecipeArchiveContext {
        guard generation == context.generation, status == .ready(context.member) else {
            throw OfflineFailure.sessionChanged
        }
        guard draft.baseline == context.recipe else { throw NestAPIFailure.conflict }
        let current = try await loadRecipeArchiveContext(context.recipe.id)
        guard current.generation == context.generation, current.member == context.member else {
            throw OfflineFailure.sessionChanged
        }
        guard current.recipe == draft.baseline else { throw NestAPIFailure.conflict }
        return current
    }

    func editRecipe(_ draft: RecipeEditDraft, context: RecipeArchiveContext) async -> Bool {
        guard let offline, let lease, generation == context.generation, status == .ready(context.member)
        else { return false }
        do {
            guard draft.baseline == context.recipe else { throw MealContractError.invalidPlacement }
            try await requireCurrentRecipe(context)
            let command = try draft.command(operation: UUID(), revision: context.revision)
            try await offline.enqueueRecipeEdit(command, baseline: context.recipe, lease: lease)
            let pending = try await offline.readRecipeEdit(lease: lease)
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeEdit = pending
            await retryRecipeEdit()
            return generation == context.generation && status == .ready(context.member)
        } catch {
            guard generation == context.generation, status == .ready(context.member) else { return false }
            recipeEditNotice = "Could not edit this recipe. Refresh the library and try again."
            return false
        }
    }

    func retryRecipeEdit() async {
        guard recipeEditSavingGeneration != generation, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        recipeEditSavingGeneration = attempt
        recipeEditSaving = true
        defer {
            if recipeEditSavingGeneration == attempt {
                recipeEditSavingGeneration = nil
                recipeEditSaving = false
            }
        }
        do {
            guard let saved = try await offline.readRecipeEdit(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.editRecipe(
                    token: session.accessToken, member: member, command: saved.command)
                try await offline.acknowledgeRecipeEdit(receipt, lease: lease)
            }
            try await reconcileEditedRecipe(token: session.accessToken, member: member, attempt: attempt)
        } catch { await handleRecipeEditFailure(error, member: member, attempt: attempt) }
    }

    private func reconcileEditedRecipe(token: String, member: VerifiedMember, attempt: Int) async throws {
        guard let offline, let lease, let api = mealAPI else { return }
        guard let acknowledged = try await offline.readRecipeEdit(lease: lease), let receipt = acknowledged.receipt
        else { return }
        guard generation == attempt, status == .ready(member) else { return }
        recipeEdit = acknowledged
        let page = try await api.library(token: token, member: member)
        let recipe = try await api.recipe(
            token: token, member: member,
            id: receipt.definitionId, revision: page.revision)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.reconcileRecipeEdit(
            SavedRecipeEnvelope(
                version: 1,
                householdId: member.householdId, revision: page.revision, recipe: recipe), lease: lease)
        let current = try await offline.readRecipeEdit(lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        recipeEdit = current
        recipeEditNotice = nil
        await refreshMealLibrary()
    }

    func discardRecipeEditConflict() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedRecipeEdit(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            recipeEdit = nil
            recipeEditNotice = nil
            await refreshMealLibrary()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            recipeEditNotice = "Could not discard this rejected edit. Try again."
        }
    }

    private func handleRecipeEditFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
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
                let pending = try? await offline.readRecipeEdit(lease: lease), pending.state == .pending
            {
                try? await offline.conflictRecipeEdit(pending.command.operationId, lease: lease)
                let saved = try? await offline.readRecipeEdit(lease: lease)
                guard generation == attempt, status == .ready(member) else { return }
                recipeEdit = saved
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        recipeEditNotice = "Could not finish editing. Review the saved request and retry when online."
    }
}
