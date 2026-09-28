import Foundation

extension SessionModel {
    func saveCookingPreferences(_ context: CookingEditContext, notes: String, slots: [MealSlot]) async -> Bool {
        guard let offline, let lease, status == .ready(context.member), generation == context.generation else {
            return false
        }
        let attempt = generation
        do {
            let command = try SaveCookingProfile(
                operationId: UUID(), expectedRevision: context.profile.profile?.revision ?? "0",
                notes: notes, slots: slots)
            let saved = SavedCookingPreference(
                baseline: context.profile, command: command, state: .pending, receipt: nil)
            try await offline.enqueueCookingPreference(saved, lease: lease)
            guard generation == attempt, status == .ready(context.member) else { return false }
            cookingPending = saved
            await retryCookingPreferences()
            return generation == attempt && status == .ready(context.member)
        } catch {
            guard generation == attempt, status == .ready(context.member) else { return false }
            cookingNotice = "Could not save these preferences. Refresh before trying again."
            return false
        }
    }

    func retryCookingPreferences() async {
        guard cookingSavingGeneration != generation, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        cookingSavingGeneration = attempt
        cookingSaving = true
        defer { finishCookingSave(attempt) }
        do {
            guard let saved = try await offline.readCookingPreference(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            guard generation == attempt, status == .ready(member) else { return }
            if saved.state == .pending {
                let receipt = try await api.saveCookingProfile(
                    token: session.accessToken, member: member, command: saved.command)
                try await offline.acknowledgeCookingPreference(receipt, lease: lease)
            }
            let acknowledged = try await offline.readCookingPreference(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            cookingPending = acknowledged
            _ = await loadCookingPreferences()
        } catch { await handleCookingFailure(error, member: member, attempt: attempt, reject: true) }
    }

    private func finishCookingSave(_ attempt: Int) {
        if cookingSavingGeneration == attempt {
            cookingSavingGeneration = nil
            cookingSaving = false
        }
    }

    func discardCookingConflict() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedCookingPreference(lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            cookingPending = nil
            _ = await loadCookingPreferences()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            cookingNotice = "Could not discard these rejected preferences. Try again."
        }
    }
}
