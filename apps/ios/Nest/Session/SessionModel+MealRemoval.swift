import Foundation

extension SessionModel {
    func removeMeal(_ meal: PlannedMeal) async {
        guard let offline, let lease, case .ready(let member) = status,
            case .loaded(let week) = mealStatus, mealSelection == week.weekStart,
            mealPlacement == nil, mealRemoval == nil, mealRecipePlacement == nil
        else { return }
        let attempt = generation
        do {
            let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
            try await requireSelectedMealWeek(week, member: member, attempt: attempt)
            try await offline.enqueueMealRemoval(week, meal: meal, command: command, lease: lease)
            let saved = try await offline.readMealRemoval(week.weekStart, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == week.weekStart
            else { return }
            mealRemoval = saved
            mealNotice = "Removing meal…"
            await retryMealRemoval()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save this removal. Refresh the week and try again."
        }
    }

    func retryMealRemoval() async {
        guard mealRemovalSavingGeneration != generation,
            let start = mealSelection, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        mealRemovalSavingGeneration = attempt
        mealRemovalSaving = true
        defer {
            if mealRemovalSavingGeneration == attempt {
                mealRemovalSavingGeneration = nil
                mealRemovalSaving = false
            }
        }
        do {
            try await sendMealRemoval(
                start: start, auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleMealRemovalFailure(
                error, start: start, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendMealRemoval(
        start: MealWeekStart, auth: any NestAuthentication, api: MealAPI,
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readMealRemoval(start, lease: lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshMealWeek() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.remove(
            token: session.accessToken, member: member,
            week: saved.week, meal: saved.meal, command: saved.command)
        try await offline.acknowledgeMealRemoval(receipt, lease: lease)
        guard generation == attempt, status == .ready(member), mealSelection == start else { return }
        mealRemoval = try await offline.readMealRemoval(start, lease: lease)
        mealNotice = "Meal removed. Refreshing the shared week…"
        await refreshMealWeek()
    }

    func discardConflictedMealRemoval() async {
        guard let start = mealSelection, let offline, let lease,
            let mealRemoval, mealRemoval.state == .conflict,
            mealRemoval.command.weekStart == start, case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealRemoval(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            self.mealRemoval = nil
            mealNotice = "Rejected removal discarded. Review the current week before trying again."
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this removal. Try again."
        }
    }

    private func handleMealRemovalFailure(
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
            await rejectMealRemoval(
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
        mealNotice = "Could not confirm this removal. Retry the same saved request when online."
    }

    private func rejectMealRemoval(
        start: MealWeekStart, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readMealRemoval(start, lease: lease),
                saved.state == .pending
            {
                try await offline.conflictMealRemoval(
                    saved.command.operationId, week: start, lease: lease)
            }
            let rejected = try await offline.readMealRemoval(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            mealRemoval = rejected
            mealNotice = "The week changed. Review it before removing this meal."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
