import Foundation

extension SessionModel {
    func addGrocery(name: String, quantity: String?, unit: String?) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        let command: AddGrocery
        do {
            command = try AddGrocery(
                operationId: UUID(), itemId: UUID(), name: name,
                quantity: quantity, unit: unit, categoryId: nil)
            try await offline.enqueueGroceryAdd(command, lease: lease)
            let saved = try await offline.readGroceryAdd(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryAdd = saved
            groceryNotice = "Saving your grocery…"
            await retryGroceryAdd()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save this grocery. Check its details and try again."
        }
    }

    func retryGroceryAdd() async {
        guard groceryAddSavingGeneration != generation,
            let auth, let api = groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        groceryAddSavingGeneration = attempt
        groceryAddSaving = true
        defer {
            if groceryAddSavingGeneration == attempt {
                groceryAddSavingGeneration = nil
                groceryAddSaving = false
            }
        }
        do {
            try await sendGroceryAdd(
                auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleGroceryAddFailure(
                error, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendGroceryAdd(
        auth: any NestAuthentication, api: GroceryAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readGroceryAdd(lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshGroceries() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.add(
            token: session.accessToken, member: member, command: saved.command)
        try await offline.acknowledgeGroceryAdd(receipt, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        let confirmed = try await offline.readGroceryAdd(lease)
        guard generation == attempt, status == .ready(member) else { return }
        groceryAdd = confirmed
        groceryNotice = "Grocery added. Refreshing the list…"
        await refreshGroceries()
    }

    func discardConflictedGroceryAdd() async {
        guard let offline, let lease, let groceryAdd, groceryAdd.state == .conflict,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedGroceryAdd(groceryAdd.command.operationId, lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            self.groceryAdd = nil
            groceryNotice = "Unconfirmed grocery discarded. Check the list before adding it again."
            await refreshGroceries()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not discard this unconfirmed grocery. Try again."
        }
    }

    private func handleGroceryAddFailure(
        _ error: Error, api: GroceryAPI, auth: any NestAuthentication,
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async {
        guard generation == attempt, status == .ready(member) else { return }
        switch error as? NestAPIFailure {
        case .signedOut, .notMember:
            await leaveGroceryAccount(state(for: error))
            return
        case .conflict, .invalid, .removed, .cutover:
            await rejectGroceryAdd(offline: offline, lease: lease, member: member, attempt: attempt)
            return
        case .forbidden:
            if await reverifyGroceryAdd(api: api, auth: auth, member: member, attempt: attempt) {
                return
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        groceryNotice = "Could not confirm this add. Retry the saved request when online."
    }

    private func rejectGroceryAdd(
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readGroceryAdd(lease), saved.state == .pending {
                try await offline.conflictGroceryAdd(
                    saved.command.operationId, reason: "rejected", lease: lease)
            }
            let rejected = try await offline.readGroceryAdd(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryAdd = rejected
            groceryNotice = "This add was rejected. Review the list before trying again."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }

    private func reverifyGroceryAdd(
        api: GroceryAPI, auth: any NestAuthentication,
        member: VerifiedMember, attempt: Int
    ) async -> Bool {
        do {
            let session = try await auth.session()
            guard generation == attempt, status == .ready(member) else { return true }
            guard session.userId == member.userId else {
                await leaveGroceryAccount(.signedOut)
                return true
            }
            let verified = try await api.verify(token: session.accessToken, expectedActor: member.userId)
            guard generation == attempt, status == .ready(member) else { return true }
            guard verified.householdId == member.householdId else {
                await leaveGroceryAccount(.notMember)
                return true
            }
        } catch {
            guard generation == attempt, status == .ready(member) else { return true }
            let mapped = state(for: error)
            if mapped == .notMember || mapped == .signedOut {
                await leaveGroceryAccount(mapped)
                return true
            }
        }
        return false
    }

    private func leaveGroceryAccount(_ next: Status) async {
        generation += 1
        let current = generation
        await clearPresentation()
        if generation == current { status = next }
    }
}
