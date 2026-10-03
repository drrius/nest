import Foundation

extension SessionModel {
    @discardableResult
    func addGrocery(name: String, quantity: String?, unit: String?, categoryId: UUID? = nil) async -> Bool {
        guard let offline, let lease, case .ready(let member) = status else { return false }
        guard groceryCategoryAvailable(categoryId) else {
            groceryNotice = "This category is no longer available. Refresh categories and try again."
            return false
        }
        let attempt = generation
        let command: AddGrocery
        do {
            command = try AddGrocery(
                operationId: UUID(), itemId: UUID(), name: name,
                quantity: quantity, unit: unit, categoryId: categoryId)
            guard try await prepareGroceryWrite(member: member, categoryId: categoryId, attempt: attempt) else {
                return false
            }
            try await offline.enqueueGroceryAdd(command, lease: lease)
            let saved = try await offline.readGroceryAdd(lease)
            guard generation == attempt, status == .ready(member) else { return false }
            groceryAdd = saved
            groceryNotice = "Saving your grocery…"
            return await retryGroceryAdd()
        } catch {
            await handleNewGroceryWriteFailure(
                error, member: member, attempt: attempt,
                notice:
                    "Could not save this grocery. Your entries are still here. Check the details and try again online.")
            return false
        }
    }

    @discardableResult
    func retryGroceryAdd() async -> Bool {
        guard groceryAddSavingGeneration != generation,
            let auth, let api = groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return false }
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
            return try await sendGroceryAdd(
                auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleGroceryAddFailure(
                error, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
            return false
        }
    }

    private func sendGroceryAdd(
        auth: any NestAuthentication, api: GroceryAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws -> Bool {
        guard let saved = try await offline.readGroceryAdd(lease) else { return false }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshGroceries() }
            return saved.state == .acknowledged && generation == attempt && status == .ready(member)
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.add(
            token: session.accessToken, member: member, command: saved.command)
        try await offline.acknowledgeGroceryAdd(receipt, lease: lease)
        guard generation == attempt, status == .ready(member) else { return false }
        let confirmed = try await offline.readGroceryAdd(lease)
        guard generation == attempt, status == .ready(member) else { return false }
        groceryAdd = confirmed
        groceryNotice = "Grocery added. Refreshing the list…"
        await refreshGroceries()
        return generation == attempt && status == .ready(member)
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
            if await reverifyGroceryMembership(api: api, auth: auth, member: member, attempt: attempt) {
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

}
