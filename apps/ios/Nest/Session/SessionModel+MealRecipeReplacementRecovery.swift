import Foundation

extension SessionModel {
    func discardConflictedMealRecipeReplacement() async {
        guard !mealRecipeReplacementSaving, let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedMealRecipeReplacement(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealRecipeReplacement = nil
            await refreshMealWeek()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not discard this rejected replacement. Try again."
        }
    }

    func handleMealRecipeReplacementFailure(_ error: Error, member: VerifiedMember, attempt: Int, reject: Bool = false)
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
            if reject { await rejectMealRecipeReplacement(member: member, attempt: attempt) }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        mealNotice = "Could not finish this replacement. Your choice is retained; review its status and retry online."
    }

    private func rejectMealRecipeReplacement(member: VerifiedMember, attempt: Int) async {
        guard let offline, let lease else { return }
        do {
            if let saved = try await offline.readMealRecipeReplacement(lease: lease), saved.state == .pending {
                try await offline.conflictMealRecipeReplacement(saved.command.operationId, lease: lease)
            }
            let saved = try await offline.readMealRecipeReplacement(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            mealRecipeReplacement = saved
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealNotice = "Could not record this rejection. Reopen Nest to review the saved replacement."
        }
    }
}
