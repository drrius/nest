import Foundation

struct CookingEditContext {
    let member: VerifiedMember
    let generation: Int
    let profile: CookingSlotsEnvelope
}

extension SessionModel {
    func loadCookingPreferences() async -> CookingEditContext? {
        guard let auth, let api = mealAPI, let offline, let lease,
            case .ready(let member) = status
        else { return nil }
        let attempt = generation
        let request = UUID()
        cookingReadRequest = request
        cookingNotice = nil
        do {
            let cached = try await offline.readCookingProfile(lease: lease)
            let pending = try await offline.readCookingPreference(lease: lease)
            guard currentCookingRead(request, member: member, attempt: attempt) else { return nil }
            cookingProfile = cached
            cookingPending = pending
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            let fresh = try await api.cookingProfile(token: session.accessToken, member: member)
            guard currentCookingRead(request, member: member, attempt: attempt) else { return nil }
            try await offline.saveCookingProfile(fresh, lease: lease)
            let latest = try await offline.readCookingProfile(lease: lease)
            let remaining = try await offline.readCookingPreference(lease: lease)
            guard currentCookingRead(request, member: member, attempt: attempt), let latest else { return nil }
            cookingProfile = latest
            cookingPending = remaining
            mealVisibleSlots = try latest.validated(household: member.householdId)
            return CookingEditContext(member: member, generation: attempt, profile: latest)
        } catch {
            guard currentCookingRead(request, member: member, attempt: attempt) else { return nil }
            await handleCookingFailure(error, member: member, attempt: attempt, reject: false)
            return nil
        }
    }

    private func currentCookingRead(_ request: UUID, member: VerifiedMember, attempt: Int) -> Bool {
        cookingReadRequest == request && generation == attempt && status == .ready(member)
    }

    func handleCookingFailure(_ error: Error, member: VerifiedMember, attempt: Int, reject: Bool) async {
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
            if reject { await rejectCookingPreference(member: member, attempt: attempt) }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        cookingNotice =
            "Could not confirm cooking preferences. Connect and retry the saved request, or refresh before editing."
    }

    private func rejectCookingPreference(member: VerifiedMember, attempt: Int) async {
        guard let offline, let lease else { return }
        do {
            if let saved = try await offline.readCookingPreference(lease: lease), saved.state == .pending {
                try await offline.conflictCookingPreference(saved.command.operationId, lease: lease)
            }
            let saved = try await offline.readCookingPreference(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            cookingPending = saved
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            cookingNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
