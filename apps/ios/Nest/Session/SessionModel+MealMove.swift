import Foundation

struct MealMoveContext {
    let member: VerifiedMember
    let generation: Int
    let source: MealWeekSnapshot
    let target: MealWeekSnapshot
    let meal: PlannedMeal
}

extension SessionModel {
    func loadMealMove(source: MealWeekStart, target: MealWeekStart, entry: UUID) async throws -> MealMoveContext {
        guard let auth, mealAPI != nil,
            case .ready(let member) = status
        else { throw NestAPIFailure.signedOut }
        let attempt = generation
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let from = try await readAndCacheMealWeek(
                source, token: session.accessToken, member: member, generation: attempt)
            let to =
                source == target
                ? from
                : try await readAndCacheMealWeek(
                    target, token: session.accessToken, member: member, generation: attempt)
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
            guard let meal = from.entries.first(where: { $0.id == entry }) else { throw NestAPIFailure.removed }
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
            return MealMoveContext(member: member, generation: attempt, source: from, target: to, meal: meal)
        } catch {
            await handleMealMoveFailure(error, member: member, attempt: attempt)
            throw error
        }
    }

    func moveMeal(_ context: MealMoveContext, date: CivilDate, slot: MealSlot) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status,
            context.member == member, context.generation == generation
        else { return false }
        let attempt = generation
        do {
            let command = try MoveMeal(
                source: context.source, target: context.target, meal: context.meal,
                operationId: UUID(), date: date, slot: slot)
            try await requireCurrentMealWeeks(context)
            let saved = SavedMealMove(
                source: context.source, target: context.target, meal: context.meal,
                command: command, state: .pending, receipt: nil)
            try await offline.enqueueMealMove(saved, lease: lease)
            guard generation == attempt, status == .ready(member) else { return false }
            mealMove = saved
            await retryMealMove()
            return generation == attempt && status == .ready(member)
        } catch {
            guard generation == attempt, status == .ready(member) else { return false }
            mealNotice = "Could not save this move. Refresh both weeks and try again."
            return false
        }
    }

    func retryMealMove() async {
        guard mealMoveSavingGeneration != generation,
            let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        mealMoveSavingGeneration = attempt
        mealMoveSaving = true
        defer { finishMealMoveAttempt(attempt) }
        do {
            guard let saved = try await offline.readMealMove(lease: lease), saved.state != .conflict else { return }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.move(token: session.accessToken, member: member, saved: saved)
                try await offline.acknowledgeMealMove(receipt, lease: lease)
            }
            guard generation == attempt, status == .ready(member) else { return }
            mealMove = try await offline.readMealMove(lease: lease)
            try await loadMealMoveWeeks(saved, token: session.accessToken, member: member, attempt: attempt)
            guard generation == attempt, status == .ready(member) else { return }
            mealMove = try await offline.readMealMove(lease: lease)
            await refreshMealWeek()
        } catch { await handleMealMoveFailure(error, member: member, attempt: attempt, reject: true) }
    }

    private func finishMealMoveAttempt(_ attempt: Int) {
        if mealMoveSavingGeneration == attempt {
            mealMoveSavingGeneration = nil
            mealMoveSaving = false
        }
    }

    private func loadMealMoveWeeks(
        _ saved: SavedMealMove, token: String,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard mealAPI != nil else { return }
        for start in Set([saved.source.weekStart, saved.target.weekStart]) {
            _ = try await readAndCacheMealWeek(start, token: token, member: member, generation: attempt)
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        }
    }

    func discardConflictedMealMove() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealMove(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealMove = nil
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this move. Try again."
        }
    }

    private func handleMealMoveFailure(_ error: Error, member: VerifiedMember, attempt: Int, reject: Bool = false) async
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
            if reject { await rejectMealMove(member: member, attempt: attempt) }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        mealNotice = "Could not finish this move. Review its saved status and retry when online."
    }

    private func rejectMealMove(member: VerifiedMember, attempt: Int) async {
        guard let offline, let lease else { return }
        do {
            if let saved = try await offline.readMealMove(lease: lease), saved.state == .pending {
                try await offline.conflictMealMove(saved.command.operationId, lease: lease)
            }
            let saved = try await offline.readMealMove(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealMove = saved
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save this rejection. Reopen Nest to review it."
        }
    }
}
