import Foundation

extension SessionModel {
    func removeGrocery(_ item: GroceryItem) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            let command = RemoveGrocery(item: item, operationId: UUID())
            guard
                try await prepareGroceryWrite(
                    member: member, categoryId: nil, item: item, attempt: attempt)
            else { return }
            try await offline.enqueueGroceryRemove(item, command: command, lease: lease)
            let saved = try await offline.readGroceryRemove(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryRemove = saved
            groceryNotice = "Removing grocery…"
            await retryGroceryRemove()
        } catch {
            await handleNewGroceryWriteFailure(
                error, member: member, attempt: attempt,
                notice: "This removal was not started. Refresh the list and try again online.")
        }
    }

    func retryGroceryRemove() async {
        guard groceryRemoveSavingGeneration != generation,
            let auth, let api = groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        groceryRemoveSavingGeneration = attempt
        groceryRemoveSaving = true
        defer {
            if groceryRemoveSavingGeneration == attempt {
                groceryRemoveSavingGeneration = nil
                groceryRemoveSaving = false
            }
        }
        do {
            try await sendGroceryRemove(
                auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleGroceryRemoveFailure(
                error, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendGroceryRemove(
        auth: any NestAuthentication, api: GroceryAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readGroceryRemove(lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshGroceries() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.remove(
            token: session.accessToken, member: member,
            item: saved.item, command: saved.command)
        try await offline.acknowledgeGroceryRemove(receipt, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        let confirmed = try await offline.readGroceryRemove(lease)
        guard generation == attempt, status == .ready(member) else { return }
        groceryRemove = confirmed
        groceryNotice = "Grocery removed. Refreshing the list…"
        await refreshGroceries()
    }

    func discardConflictedGroceryRemove() async {
        guard let offline, let lease, let groceryRemove, groceryRemove.state == .conflict,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedGroceryRemove(groceryRemove.command.operationId, lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            self.groceryRemove = nil
            groceryNotice = "Rejected removal discarded. Check the latest item before trying again."
            await refreshGroceries()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not discard this removal. Try again."
        }
    }

    private func handleGroceryRemoveFailure(
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
            await rejectGroceryRemove(offline: offline, lease: lease, member: member, attempt: attempt)
            return
        case .forbidden:
            if await reverifyGroceryMembership(api: api, auth: auth, member: member, attempt: attempt) {
                return
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        groceryNotice = "Could not confirm this removal. Retry the saved request when online."
    }

    private func rejectGroceryRemove(
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readGroceryRemove(lease), saved.state == .pending {
                try await offline.conflictGroceryRemove(
                    saved.command.operationId, reason: "rejected", lease: lease)
            }
            let rejected = try await offline.readGroceryRemove(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryRemove = rejected
            groceryNotice = "This removal was rejected. Review the latest item before trying again."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
