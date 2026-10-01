import Foundation

extension SessionModel {
    func replaceMealWithRecipe(_ context: MealMoveContext, recipe: SavedRecipe, libraryRevision: String) async -> Bool {
        guard mealRecipeReplacementSavingGeneration != generation,
            let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status, context.member == member, context.generation == generation
        else { return false }
        let attempt = generation
        mealRecipeReplacementSavingGeneration = attempt
        mealRecipeReplacementSaving = true
        defer { finishMealRecipeReplacementAttempt(attempt) }
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let fresh = try await checkMealRecipeReplacement(
                context, recipe: recipe, libraryRevision: libraryRevision,
                token: session.accessToken, member: member, api: api)
            guard generation == attempt, status == .ready(member) else { return false }
            let command = try ReplaceSavedRecipe(
                week: fresh, meal: context.meal, recipe: recipe,
                libraryRevision: libraryRevision, operationId: UUID())
            let saved = SavedMealRecipeReplacement(
                week: fresh, meal: context.meal, recipe: recipe,
                command: command, state: .pending, receipt: nil)
            try await offline.saveMealWeek(fresh, lease: lease)
            try await offline.enqueueMealRecipeReplacement(saved, lease: lease)
            guard generation == attempt, status == .ready(member) else { return false }
            mealRecipeReplacement = saved
            do {
                try await sendMealRecipeReplacement(
                    saved, token: session.accessToken, member: member,
                    api: api, offline: offline, lease: lease, attempt: attempt)
            } catch { await handleMealRecipeReplacementFailure(error, member: member, attempt: attempt, reject: true) }
            return generation == attempt && status == .ready(member)
        } catch {
            await handleMealRecipeReplacementFailure(error, member: member, attempt: attempt)
            return false
        }
    }

    private func checkMealRecipeReplacement(
        _ context: MealMoveContext, recipe: SavedRecipe, libraryRevision: String,
        token: String, member: VerifiedMember, api: MealAPI
    ) async throws -> MealWeekSnapshot {
        let fresh = try await api.week(token: token, member: member, start: context.source.weekStart)
        let listing = try await api.library(token: token, member: member)
        guard fresh == context.source, listing.revision == libraryRevision else { throw NestAPIFailure.conflict }
        let detail = try await api.recipe(token: token, member: member, id: recipe.id, revision: libraryRevision)
        guard detail == recipe else { throw NestAPIFailure.conflict }
        return fresh
    }

    func retryMealRecipeReplacement() async {
        guard mealRecipeReplacementSavingGeneration != generation,
            let auth, let api = mealAPI, let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        mealRecipeReplacementSavingGeneration = attempt
        mealRecipeReplacementSaving = true
        defer { finishMealRecipeReplacementAttempt(attempt) }
        do {
            guard let saved = try await offline.readMealRecipeReplacement(lease: lease), saved.state != .conflict
            else { return }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            try await sendMealRecipeReplacement(
                saved, token: session.accessToken, member: member,
                api: api, offline: offline, lease: lease, attempt: attempt)
        } catch { await handleMealRecipeReplacementFailure(error, member: member, attempt: attempt, reject: true) }
    }

    private func sendMealRecipeReplacement(
        _ saved: SavedMealRecipeReplacement, token: String,
        member: VerifiedMember, api: MealAPI, offline: ChoreOfflineStore, lease: OfflineLease, attempt: Int
    ) async throws {
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        if saved.state == .pending {
            let receipt = try await api.replaceWithRecipe(
                token: token, member: member, week: saved.week,
                meal: saved.meal, recipe: saved.recipe, command: saved.command)
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
            try await offline.acknowledgeMealRecipeReplacement(receipt, lease: lease)
        }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        mealRecipeReplacement = try await offline.readMealRecipeReplacement(lease: lease)
        guard let receipt = mealRecipeReplacement?.receipt else { throw MealContractError.invalidReceipt }
        let week = try await api.week(token: token, member: member, start: saved.week.weekStart)
        var retained: PlannedRecipeEnvelope?
        if week.revision == receipt.revision {
            retained = try await api.plannedRecipe(token: token, member: member, week: week, id: receipt.entryId)
        }
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        try await offline.saveMealWeek(week, lease: lease)
        try await offline.clearConfirmedMealRecipeReplacement(week, retained: retained, lease: lease)
        let remaining = try await offline.readMealRecipeReplacement(lease: lease)
        guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        mealRecipeReplacement = remaining
        mealNotice =
            remaining == nil
            ? "Meal replaced with its saved recipe." : "Replacement accepted. Refresh to confirm the current plan."
        await refreshMealWeek()
    }

    private func finishMealRecipeReplacementAttempt(_ attempt: Int) {
        if mealRecipeReplacementSavingGeneration == attempt {
            mealRecipeReplacementSavingGeneration = nil
            mealRecipeReplacementSaving = false
        }
    }
}
