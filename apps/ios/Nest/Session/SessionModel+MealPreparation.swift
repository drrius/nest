import Foundation

extension SessionModel {
    func saveMealPreparation(_ command: MealPreparationCommand, context: MealPreparationContext) async -> Bool {
        guard let offline, let lease, generation == context.generation, status == .ready(context.member) else {
            return false
        }
        do {
            let target = PlannedRecipeTarget(start: context.baseline.weekStart, id: context.baseline.entryId)
            let fresh = try await loadMealPreparationContext(target)
            try checkPreparationScope(context.member, attempt: context.generation)
            guard fresh.baseline == context.baseline else { throw NestAPIFailure.conflict }
            try command.validate(fresh.baseline)
            if let assignment = command.changedAssignment, !fresh.roster.contains(assignment) {
                throw NestAPIFailure.invalid
            }
            try await offline.enqueueMealPreparation(command, baseline: fresh.baseline, lease: lease)
            try checkPreparationScope(context.member, attempt: context.generation)
            await restorePreparationRecovery()
            try checkPreparationScope(context.member, attempt: context.generation)
            await retryMealPreparation()
            return generation == context.generation && status == .ready(context.member)
        } catch {
            guard generation == context.generation, status == .ready(context.member) else { return false }
            mealPreparationNotice =
                "Could not save this preparation. Your draft stays here. Reopen it to load the current meal."
            return false
        }
    }

    func retryMealPreparation() async {
        guard mealPreparationSavingGeneration != generation, let auth, let api = mealAPI,
            let offline, let lease, case .ready(let member) = status
        else { return }
        let attempt = generation
        mealPreparationSavingGeneration = attempt
        mealPreparationSaving = true
        defer {
            if mealPreparationSavingGeneration == attempt {
                mealPreparationSavingGeneration = nil
                mealPreparationSaving = false
            }
        }
        do {
            guard let saved = try await offline.readMealPreparation(lease: lease), saved.state != .conflict else {
                return
            }
            let session = try await auth.session()
            try checkPreparationScope(member, attempt: attempt)
            guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
            if saved.state == .pending {
                let receipt: MealPreparationReceipt
                switch saved.command {
                case .create(let command):
                    receipt = try await api.createPreparation(
                        token: session.accessToken, member: member, command: command)
                case .edit(let command):
                    receipt = try await api.editPreparation(
                        token: session.accessToken, member: member, command: command)
                }
                try checkPreparationScope(member, attempt: attempt)
                try await offline.acknowledgeMealPreparation(receipt, lease: lease)
            }
            try checkPreparationScope(member, attempt: attempt)
            await restorePreparationRecovery()
            try checkPreparationScope(member, attempt: attempt)
            let target = PlannedRecipeTarget(start: saved.baseline.weekStart, id: saved.baseline.entryId)
            let fresh = try await loadMealPreparationContext(target)
            try checkPreparationScope(member, attempt: attempt)
            try await offline.reconcileMealPreparation(fresh.baseline, lease: lease)
            try checkPreparationScope(member, attempt: attempt)
            await restorePreparationRecovery()
            try checkPreparationScope(member, attempt: attempt)
            mealPreparationNotice = nil
        } catch { await handlePreparationFailure(error, member: member, attempt: attempt) }
    }

    func discardPreparationConflict() async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardMealPreparationConflict(lease: lease)
            try checkPreparationScope(member, attempt: attempt)
            mealPreparationRequest = nil
            mealPreparationNotice = nil
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            mealPreparationNotice = "Could not discard this rejected request. Try again."
        }
    }

    private func handlePreparationFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
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
            if let offline, let lease, let pending = try? await offline.readMealPreparation(lease: lease),
                pending.state == .pending
            {
                guard generation == attempt, status == .ready(member) else { return }
                try? await offline.conflictMealPreparation(pending.command.operationId, lease: lease)
                await restorePreparationRecovery()
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        mealPreparationNotice = "Could not finish saving. Review the saved request and retry when online."
    }
}

extension MealPreparationCommand {
    var changedAssignment: RoutineAssignment? {
        switch self {
        case .create(let value): value.preparation.assignment
        case .edit(let value): value.patch.assignment
        }
    }
}
