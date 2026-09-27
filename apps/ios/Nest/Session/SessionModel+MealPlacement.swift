import Foundation

extension SessionModel {
    @discardableResult
    func placeMeal(date: CivilDate, slot: MealSlot, title: String) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status,
            case .loaded(let week) = mealStatus, mealSelection == week.weekStart
        else { return false }
        let attempt = generation
        do {
            let command = try PlaceMeal(
                week: week, operationId: UUID(), date: date, slot: slot, title: title)
            try await offline.enqueueMealPlacement(week, command: command, lease: lease)
            let saved = try await offline.readMealPlacement(week.weekStart, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == week.weekStart
            else { return false }
            mealPlacement = saved
            mealNotice = "Saving your meal…"
            await retryMealPlacement()
            return true
        } catch {
            guard generation == attempt, status == .ready(member) else { return false }
            mealNotice = "Could not save this meal. Refresh the week and try again."
            return false
        }
    }

    func retryMealPlacement() async {
        guard mealPlacementSavingGeneration != generation,
            let start = mealSelection, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        mealPlacementSavingGeneration = attempt
        mealPlacementSaving = true
        defer {
            if mealPlacementSavingGeneration == attempt {
                mealPlacementSavingGeneration = nil
                mealPlacementSaving = false
            }
        }
        do {
            try await sendMealPlacement(
                start: start, auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleMealPlacementFailure(
                error, start: start, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendMealPlacement(
        start: MealWeekStart, auth: any NestAuthentication, api: MealAPI,
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readMealPlacement(start, lease: lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshMealWeek() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.place(
            token: session.accessToken, member: member,
            week: saved.week, command: saved.command)
        try await offline.acknowledgeMealPlacement(receipt, lease: lease)
        guard generation == attempt, status == .ready(member), mealSelection == start else { return }
        mealPlacement = try await offline.readMealPlacement(start, lease: lease)
        mealNotice = "Meal saved. Refreshing the shared week…"
        await refreshMealWeek()
    }

    func discardConflictedMealPlacement() async {
        guard let start = mealSelection, let offline, let lease,
            let mealPlacement, mealPlacement.state == .conflict,
            mealPlacement.command.weekStart == start, case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealPlacement(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            self.mealPlacement = nil
            mealNotice = "Rejected meal discarded. Review the current week before trying again."
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this meal. Try again."
        }
    }

    private func handleMealPlacementFailure(
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
            await rejectMealPlacement(
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
        mealNotice = "Could not confirm this meal. Retry the same saved request when online."
    }

    private func rejectMealPlacement(
        start: MealWeekStart, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readMealPlacement(start, lease: lease),
                saved.state == .pending
            {
                try await offline.conflictMealPlacement(
                    saved.command.operationId, week: start, lease: lease)
            }
            let rejected = try await offline.readMealPlacement(start, lease: lease)
            guard generation == attempt, status == .ready(member), mealSelection == start else { return }
            mealPlacement = rejected
            mealNotice = "The week changed. Review it before choosing another meal."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
