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
        do {
            let ticket = try await offline.beginMealWeekRead(target.start, lease: lease)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            await showCachedPlannedRecipe(
                target, offline: offline, ticket: ticket,
                request: request, member: member, attempt: attempt)
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            let week = try await readAndCacheMealWeek(
                target.start, token: session.accessToken, member: member, generation: attempt)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            let fresh = try await api.plannedRecipe(
                token: session.accessToken, member: member, week: week, id: target.id)
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            try await showFreshPlannedRecipe(
                fresh, target: target, offline: offline, ticket: ticket,
                request: request, member: member, attempt: attempt)
        } catch {
            await handlePlannedRecipeFailure(
                error, api: api, auth: auth, request: request,
                member: member, attempt: attempt)
        }
    }

    private func showCachedPlannedRecipe(
        _ target: PlannedRecipeTarget, offline: ChoreOfflineStore, ticket: MealWeekReadTicket,
        request: UUID, member: VerifiedMember, attempt: Int
    ) async {
        do {
            let cached = try await offline.readPlannedRecipe(target.id, start: target.start, lease: ticket.lease)
            guard try await offline.isCurrentMealWeekRead(ticket) else { return }
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
        ticket: MealWeekReadTicket, request: UUID, member: VerifiedMember, attempt: Int
    ) async throws {
        guard try await offline.savePlannedRecipeRead(fresh, id: target.id, ticket: ticket) else {
            throw NestAPIFailure.conflict
        }
        let visible = try await offline.readPlannedRecipe(target.id, start: target.start, lease: ticket.lease)
        guard try await offline.isCurrentMealWeekRead(ticket) else { throw NestAPIFailure.conflict }
        guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
        plannedRecipe = .loaded(visible ?? fresh)
        plannedRecipeFresh = visible == fresh
        plannedRecipeNotice = plannedRecipeFresh ? nil : "Saved copy · refresh to check the current week."
    }

    private func currentPlannedRecipe(_ request: UUID, member: VerifiedMember, attempt: Int) -> Bool {
        generation == attempt && status == .ready(member) && plannedRecipeRequest == request
    }

    private func handlePlannedRecipeFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication, request: UUID,
        member: VerifiedMember, attempt: Int
    ) async {
        guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
        if (error as? NestAPIFailure) == .forbidden {
            await handleDeniedPlannedRecipe(api: api, auth: auth, member: member, attempt: attempt, request: request)
            return
        }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveMealAccount(mapped)
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

    private func handleDeniedPlannedRecipe(
        api: MealAPI, auth: any NestAuthentication, member: VerifiedMember, attempt: Int, request: UUID
    ) async {
        guard let target = plannedRecipeTarget else { return }
        do {
            try await forgetDeniedMealWeek(target.start, member: member, generation: attempt)
        } catch {
            guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
            await leaveMealAccount(.unavailable)
            return
        }
        guard currentPlannedRecipe(request, member: member, attempt: attempt) else { return }
        _ = await reverifyMealMembership(api: api, auth: auth, member: member, attempt: attempt)
    }
}
