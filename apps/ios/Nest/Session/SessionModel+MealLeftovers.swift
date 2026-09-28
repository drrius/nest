import Foundation

extension SessionModel {
    func placeMealLeftovers(_ context: MealMoveContext, date: CivilDate, slot: MealSlot) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status,
            context.member == member, context.generation == generation
        else { return false }
        let attempt = generation
        do {
            let command = try PlaceLeftovers(
                source: context.source, target: context.target, meal: context.meal,
                operationId: UUID(), date: date, slot: slot)
            let saved = SavedMealLeftovers(
                source: context.source, target: context.target, meal: context.meal,
                placement: command, state: .pending, receipt: nil)
            try await offline.enqueueMealLeftovers(saved, lease: lease)
            guard generation == attempt, status == .ready(member) else { return false }
            mealLeftovers = saved
            await retryMealLeftovers()
            return generation == attempt && status == .ready(member)
        } catch {
            guard generation == attempt, status == .ready(member) else { return false }
            mealNotice = "Could not save these leftovers. Refresh both weeks and try again."
            return false
        }
    }

    func retryMealLeftovers() async {
        guard mealLeftoversSavingGeneration != generation,
            let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        mealLeftoversSavingGeneration = attempt
        mealLeftoversSaving = true
        defer { finishMealLeftoversAttempt(attempt) }
        do {
            guard let saved = try await offline.readMealLeftovers(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.placeLeftovers(
                    token: session.accessToken, member: member, source: saved.source,
                    target: saved.target, meal: saved.meal, placement: saved.placement)
                try await offline.acknowledgeMealLeftovers(receipt, lease: lease)
            }
            guard generation == attempt, status == .ready(member) else { return }
            mealLeftovers = try await offline.readMealLeftovers(lease: lease)
            try await loadMealLeftoversWeeks(saved, token: session.accessToken, member: member, attempt: attempt)
            guard generation == attempt, status == .ready(member) else { return }
            mealLeftovers = try await offline.readMealLeftovers(lease: lease)
            await refreshMealWeek()
        } catch { await handleMealLeftoversFailure(error, member: member, attempt: attempt, reject: true) }
    }

    private func finishMealLeftoversAttempt(_ attempt: Int) {
        if mealLeftoversSavingGeneration == attempt {
            mealLeftoversSavingGeneration = nil
            mealLeftoversSaving = false
        }
    }

    private func loadMealLeftoversWeeks(
        _ saved: SavedMealLeftovers, token: String,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard let api = mealAPI, let offline, let lease else { return }
        for start in Set([saved.source.weekStart, saved.target.weekStart]) {
            let week = try await api.week(token: token, member: member, start: start)
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
            try await offline.saveMealWeek(week, lease: lease)
        }
    }

    func discardConflictedMealLeftovers() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealLeftovers(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealLeftovers = nil
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard these leftovers. Try again."
        }
    }

    private func handleMealLeftoversFailure(_ error: Error, member: VerifiedMember, attempt: Int, reject: Bool = false)
        async
    {
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
            if reject { await rejectMealLeftovers(member: member, attempt: attempt) }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        mealNotice = "Could not finish these leftovers. Review its saved status and retry when online."
    }

    private func rejectMealLeftovers(member: VerifiedMember, attempt: Int) async {
        guard let offline, let lease else { return }
        do {
            if let saved = try await offline.readMealLeftovers(lease: lease), saved.state == .pending {
                try await offline.conflictMealLeftovers(saved.placement.command.operationId, lease: lease)
            }
            let saved = try await offline.readMealLeftovers(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealLeftovers = saved
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save this rejection. Reopen Nest to review it."
        }
    }
}
