import Foundation

extension SessionModel {
    func openCurrentMealWeek() async {
        do { await selectMealWeek(try MealWeekStart.current()) } catch {
            mealStatus = .failed
            mealNotice = "Could not choose this week."
        }
    }

    func selectMealWeek(_ start: MealWeekStart) async {
        mealSelection = start
        mealStatus = .loading
        mealNotice = nil
        mealPlacement = nil
        mealRemoval = nil
        mealRecipePlacement = nil
        await refreshMealWeek()
    }

    func refreshMealWeek() async {
        guard let start = mealSelection, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        let request = UUID()
        mealLoadingRequest = request
        do {
            let cached = try await offline.readMealWeek(start, lease: lease)
            let pending = try await offline.readMealPlacement(start, lease: lease)
            let pendingRemoval = try await offline.readMealRemoval(start, lease: lease)
            let pendingRecipe = try await offline.readMealRecipePlacement(start, lease: lease)
            guard isCurrentMealRequest(request, start: start, member: member, attempt: attempt)
            else { return }
            mealStatus = cached.map(MealStatus.loaded) ?? .loading
            mealPlacement = pending
            mealRemoval = pendingRemoval
            mealRecipePlacement = pendingRecipe
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let fresh = try await api.week(token: session.accessToken, member: member, start: start)
            guard isCurrentMealRequest(request, start: start, member: member, attempt: attempt)
            else { return }
            try await offline.saveMealWeek(fresh, lease: lease)
            let visible = try await offline.readMealWeek(start, lease: lease)
            let saved = try await offline.readMealPlacement(start, lease: lease)
            let savedRemoval = try await offline.readMealRemoval(start, lease: lease)
            let savedRecipePlacement = try await offline.readMealRecipePlacement(start, lease: lease)
            guard isCurrentMealRequest(request, start: start, member: member, attempt: attempt)
            else { return }
            mealStatus = visible.map(MealStatus.loaded) ?? .loaded(fresh)
            mealPlacement = saved
            mealRemoval = savedRemoval
            mealRecipePlacement = savedRecipePlacement
            mealNotice = refreshNotice(
                placement: saved, removal: savedRemoval, recipe: savedRecipePlacement)
        } catch {
            await handleMealReadFailure(
                error, api: api, auth: auth, member: member, attempt: attempt,
                request: request, start: start)
        }
    }

    private func refreshNotice(
        placement: SavedMealPlacement?, removal: SavedMealRemoval?,
        recipe: SavedMealRecipePlacement?
    ) -> String? {
        if removal?.state == .acknowledged { return "Meal removed. Refreshing the shared week…" }
        if placement?.state == .acknowledged { return "Meal saved. Refreshing the shared week…" }
        if recipe?.state == .acknowledged { return "Saved meal added. Refreshing the shared week…" }
        return nil
    }

    private func isCurrentMealRequest(
        _ request: UUID, start: MealWeekStart, member: VerifiedMember, attempt: Int
    ) -> Bool {
        generation == attempt && status == .ready(member)
            && mealSelection == start && mealLoadingRequest == request
    }

    private func handleMealReadFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int, request: UUID, start: MealWeekStart
    ) async {
        guard isCurrentMealRequest(request, start: start, member: member, attempt: attempt)
        else { return }
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
        guard isCurrentMealRequest(request, start: start, member: member, attempt: attempt)
        else { return }
        if case .loaded = mealStatus {
            mealNotice = "Showing saved meals. Connect and refresh before changing the week."
        } else {
            mealStatus = .failed
            mealNotice = "Could not load this week. Try again online."
        }
    }

    func reverifyMealMembership(
        api: MealAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int
    ) async -> Bool {
        do {
            let session = try await auth.session()
            guard generation == attempt, status == .ready(member) else { return true }
            guard session.userId == member.userId else {
                await leaveMealAccount(.signedOut)
                return true
            }
            let verified = try await api.verify(token: session.accessToken, expectedActor: member.userId)
            guard generation == attempt, status == .ready(member) else { return true }
            guard verified.householdId == member.householdId else {
                await leaveMealAccount(.notMember)
                return true
            }
        } catch {
            guard generation == attempt, status == .ready(member) else { return true }
            let mapped = state(for: error)
            if mapped == .notMember || mapped == .signedOut {
                await leaveMealAccount(mapped)
                return true
            }
        }
        return false
    }

    func leaveMealAccount(_ next: Status) async {
        generation += 1
        let current = generation
        await clearPresentation()
        if generation == current { status = next }
    }

    func refreshMealVisibleSlots() async {
        guard let auth, let api = mealAPI, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let slots = try await api.visibleSlots(token: session.accessToken, member: member)
            guard generation == attempt, status == .ready(member) else { return }
            mealVisibleSlots = slots
            mealSlotNotice = nil
        } catch {
            await handleMealSlotFailure(error, api: api, auth: auth, member: member, attempt: attempt)
        }
    }

    private func handleMealSlotFailure(
        _ error: Error, api: MealAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int
    ) async {
        guard generation == attempt, status == .ready(member) else { return }
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
        guard generation == attempt, status == .ready(member) else { return }
        mealSlotNotice = "Could not refresh visible meal slots. Pull down to try again."
    }
}
