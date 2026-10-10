import Foundation

extension SessionModel {
    func replaceMeal(_ context: MealMoveContext, title: String) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status,
            context.member == member, context.generation == generation
        else { return false }
        let attempt = generation
        do {
            let command = try ReplaceMeal(
                week: context.source, meal: context.meal,
                operationId: UUID(), title: title)
            try await requireCurrentMealWeeks(context)
            let saved = SavedMealReplacement(
                week: context.source, meal: context.meal,
                command: command, state: .pending, receipt: nil)
            try await offline.enqueueMealReplacement(saved, lease: lease)
            guard generation == attempt, status == .ready(member) else { return false }
            mealReplacement = saved
            await retryMealReplacement()
            return generation == attempt && status == .ready(member)
        } catch {
            guard generation == attempt, status == .ready(member) else { return false }
            mealNotice = "Could not save this replacement. Refresh the week and try again."
            return false
        }
    }

    func retryMealReplacement() async {
        guard mealReplacementSavingGeneration != generation,
            let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        mealReplacementSavingGeneration = attempt
        mealReplacementSaving = true
        defer { finishMealReplacementAttempt(attempt) }
        do {
            guard let saved = try await offline.readMealReplacement(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.replace(
                    token: session.accessToken, member: member, week: saved.week, meal: saved.meal,
                    command: saved.command)
                try await offline.acknowledgeMealReplacement(receipt, lease: lease)
            }
            guard generation == attempt, status == .ready(member) else { return }
            mealReplacement = try await offline.readMealReplacement(lease: lease)
            try await loadMealReplacementWeeks(saved, token: session.accessToken, member: member, attempt: attempt)
            guard generation == attempt, status == .ready(member) else { return }
            mealReplacement = try await offline.readMealReplacement(lease: lease)
            await refreshMealWeek()
        } catch { await handleMealReplacementFailure(error, member: member, attempt: attempt, reject: true) }
    }

    private func finishMealReplacementAttempt(_ attempt: Int) {
        if mealReplacementSavingGeneration == attempt {
            mealReplacementSavingGeneration = nil
            mealReplacementSaving = false
        }
    }

    private func loadMealReplacementWeeks(
        _ saved: SavedMealReplacement, token: String,
        member: VerifiedMember, attempt: Int
    ) async throws {
        guard mealAPI != nil else { return }
        do {
            let start = saved.week.weekStart
            _ = try await readAndCacheMealWeek(start, token: token, member: member, generation: attempt)
            guard generation == attempt, status == .ready(member) else { throw OfflineFailure.sessionChanged }
        }
    }

    func discardConflictedMealReplacement() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealReplacement(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealReplacement = nil
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this replacement. Try again."
        }
    }

    private func handleMealReplacementFailure(
        _ error: Error, member: VerifiedMember, attempt: Int, reject: Bool = false
    ) async {
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
            if reject { await rejectMealReplacement(member: member, attempt: attempt) }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        mealNotice = "Could not finish this replacement. Review its saved status and retry when online."
    }

    private func rejectMealReplacement(member: VerifiedMember, attempt: Int) async {
        guard let offline, let lease else { return }
        do {
            if let saved = try await offline.readMealReplacement(lease: lease), saved.state == .pending {
                try await offline.conflictMealReplacement(saved.command.operationId, lease: lease)
            }
            let saved = try await offline.readMealReplacement(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealReplacement = saved
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not save this rejection. Reopen Nest to review it."
        }
    }
}
