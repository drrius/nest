import Foundation

extension SessionModel {
    @discardableResult
    func placeSavedRecipe(date: CivilDate, slot: MealSlot, recipe: SavedRecipe) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status,
            case .loaded(let week) = mealStatus, mealSelection == week.weekStart,
            case .loaded(let listing) = mealLibrary,
            savedRecipeRevision == listing.revision,
            case .loaded(let detail) = savedRecipe, detail == recipe,
            listing.meals.contains(where: { $0.id == recipe.id && $0.title == recipe.title }),
            mealPlacement == nil, mealRemoval == nil, mealRecipePlacement == nil
        else { return false }
        let attempt = generation
        do {
            let command = try PlaceSavedRecipe(
                week: week, recipe: recipe, libraryRevision: listing.revision,
                operationId: UUID(), date: date, slot: slot)
            try await offline.enqueueMealRecipePlacement(
                week, recipe: recipe, command: command, lease: lease)
            let saved = try await offline.readMealRecipePlacement(week.weekStart, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == week.weekStart
            else { return false }
            mealRecipePlacement = saved
            mealNotice = "Saving saved meal…"
            await retryMealRecipePlacement()
            return true
        } catch {
            guard generation == attempt, status == .ready(member) else { return false }
            mealNotice = "Could not save this meal. Refresh the week and library before trying again."
            return false
        }
    }

    func retryMealRecipePlacement() async {
        guard mealRecipePlacementSavingGeneration != generation,
            let start = mealSelection, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        mealRecipePlacementSavingGeneration = attempt
        mealRecipePlacementSaving = true
        defer {
            if mealRecipePlacementSavingGeneration == attempt {
                mealRecipePlacementSavingGeneration = nil
                mealRecipePlacementSaving = false
            }
        }
        do {
            try await sendMealRecipePlacement(
                start: start, auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleMealRecipePlacementFailure(
                error, start: start, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendMealRecipePlacement(
        start: MealWeekStart, auth: any NestAuthentication, api: MealAPI,
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readMealRecipePlacement(start, lease: lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshMealWeek() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.placeRecipe(
            token: session.accessToken, member: member,
            week: saved.week, recipe: saved.recipe, command: saved.command)
        try await offline.acknowledgeMealRecipePlacement(receipt, lease: lease)
        guard generation == attempt, status == .ready(member), mealSelection == start else { return }
        mealRecipePlacement = try await offline.readMealRecipePlacement(start, lease: lease)
        mealNotice = "Saved meal added. Refreshing the shared week…"
        await refreshMealWeek()
    }

    func discardConflictedMealRecipePlacement() async {
        guard let start = mealSelection, let offline, let lease,
            let mealRecipePlacement, mealRecipePlacement.state == .conflict,
            mealRecipePlacement.command.weekStart == start, case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealRecipePlacement(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            self.mealRecipePlacement = nil
            mealNotice = "Rejected saved meal discarded. Review the current week before trying again."
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this saved meal. Try again."
        }
    }

    private func handleMealRecipePlacementFailure(
        _ error: Error, start: MealWeekStart, api: MealAPI,
        auth: any NestAuthentication, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        guard generation == attempt, status == .ready(member), mealSelection == start else { return }
        switch error as? NestAPIFailure {
        case .signedOut, .notMember:
            await leaveMealAccount(state(for: error))
            return
        case .conflict, .invalid, .removed, .cutover:
            await rejectMealRecipePlacement(
                start: start, offline: offline, lease: lease,
                member: member, attempt: attempt)
            return
        case .forbidden:
            if await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt) {
                return
            }
        default: break
        }
        guard generation == attempt, status == .ready(member), mealSelection == start else { return }
        mealNotice = "Could not confirm this saved meal. Retry the same saved request when online."
    }

    private func rejectMealRecipePlacement(
        start: MealWeekStart, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readMealRecipePlacement(start, lease: lease),
                saved.state == .pending
            {
                try await offline.conflictMealRecipePlacement(
                    saved.command.operationId, week: start, lease: lease)
            }
            let rejected = try await offline.readMealRecipePlacement(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            mealRecipePlacement = rejected
            mealNotice = "The week or library changed. Review both before choosing another meal."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
