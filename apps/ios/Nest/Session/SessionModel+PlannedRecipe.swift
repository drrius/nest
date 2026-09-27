import Foundation

extension SessionModel {
    func loadPlannedRecipe(_ target: PlannedRecipeTarget) async {
        guard let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        let request = UUID()
        plannedRecipeTarget = target
        plannedRecipeRequest = request
        plannedRecipe = .loading
        plannedRecipeFresh = false
        plannedRecipeNotice = nil
        await showCachedPlannedRecipe(
            target, offline: offline, lease: lease,
            request: request, member: member, attempt: attempt)
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            let week = try await api.week(token: session.accessToken, member: member, start: target.start)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            let fresh = try await api.plannedRecipe(
                token: session.accessToken, member: member, week: week, id: target.id)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            await showFreshPlannedRecipe(
                fresh, target: target, offline: offline, lease: lease,
                request: request, member: member, attempt: attempt)
        } catch {
            await handlePlannedRecipeFailure(
                error, api: api, auth: auth, request: request,
                member: member, attempt: attempt)
        }
    }

    private func showCachedPlannedRecipe(
        _ target: PlannedRecipeTarget, offline: ChoreOfflineStore, lease: OfflineLease,
        request: UUID, member: VerifiedMember, attempt: Int
    ) async {
        do {
            let cached = try await offline.readPlannedRecipe(target.id, start: target.start, lease: lease)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            if let cached {
                plannedRecipe = .loaded(cached)
                plannedRecipeNotice = "Saved copy · checking the current week…"
            }
        } catch {
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            plannedRecipeNotice = "Could not read saved details. Checking online…"
        }
    }

    private func showFreshPlannedRecipe(
        _ fresh: PlannedRecipeEnvelope, target: PlannedRecipeTarget, offline: ChoreOfflineStore,
        lease: OfflineLease, request: UUID, member: VerifiedMember, attempt: Int
    ) async {
        do {
            try await offline.savePlannedRecipe(fresh, id: target.id, lease: lease)
            let visible = try await offline.readPlannedRecipe(target.id, start: target.start, lease: lease)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            plannedRecipe = .loaded(visible ?? fresh)
            plannedRecipeFresh = visible == fresh
            plannedRecipeNotice = plannedRecipeFresh ? nil : "Saved copy · refresh to check the current week."
        } catch {
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            plannedRecipe = .loaded(fresh)
            plannedRecipeFresh = true
            plannedRecipeNotice = "Showing current details. Could not save an offline copy."
        }
    }

    private func currentPlannedRecipe(_ request: UUID, member: VerifiedMember, attempt: Int) -> Bool {
        generation == attempt && status == .ready(member) && plannedRecipeRequest == request
    }

    private func handlePlannedRecipeFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication, request: UUID,
        member: VerifiedMember, attempt: Int
    ) async {
        guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveMealAccount(mapped)
            return
        }
        if (error as? NestAPIFailure) == .forbidden,
            await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
        {
            return
        }
        guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
        if case .loaded = plannedRecipe {
            plannedRecipeNotice = "Saved copy · may be out of date. Connect and refresh to check this meal."
        } else {
            plannedRecipe = .failed
            plannedRecipeNotice =
                (error as? NestAPIFailure) == .conflict
                ? "The week changed while loading. Refresh to check this meal."
                : "Could not load this meal. Try again online."
        }
    }
}
