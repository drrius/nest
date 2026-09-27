import Foundation

extension SessionModel {
    func editGrocery(
        _ item: GroceryItem, name: String, quantity: String?,
        unit: String?, categoryId: UUID?
    ) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        guard groceryCategoryAvailable(categoryId) else {
            groceryNotice = "This category is no longer available. Refresh and try again."
            return
        }
        let attempt = generation
        do {
            let command = try EditGrocery(
                item: item, operationId: UUID(), name: name,
                quantity: quantity, unit: unit, categoryId: categoryId)
            try await offline.enqueueGroceryEdit(item, command: command, lease: lease)
            let saved = try await offline.readGroceryEdit(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryEdit = saved
            groceryNotice = "Saving your edit…"
            await retryGroceryEdit()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save this edit. Refresh the list and try again."
        }
    }

    func retryGroceryEdit() async {
        guard groceryEditSavingGeneration != generation,
            let auth, let api = groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        groceryEditSavingGeneration = attempt
        groceryEditSaving = true
        defer {
            if groceryEditSavingGeneration == attempt {
                groceryEditSavingGeneration = nil
                groceryEditSaving = false
            }
        }
        do {
            try await sendGroceryEdit(
                auth: auth, api: api, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleGroceryEditFailure(
                error, api: api, auth: auth, offline: offline,
                lease: lease, member: member, attempt: attempt)
        }
    }

    private func sendGroceryEdit(
        auth: any NestAuthentication, api: GroceryAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        guard let saved = try await offline.readGroceryEdit(lease) else { return }
        guard saved.state == .pending else {
            if saved.state == .acknowledged { await refreshGroceries() }
            return
        }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let receipt = try await api.edit(
            token: session.accessToken, member: member,
            item: saved.item, command: saved.command)
        try await offline.acknowledgeGroceryEdit(receipt, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        let confirmed = try await offline.readGroceryEdit(lease)
        guard generation == attempt, status == .ready(member) else { return }
        groceryEdit = confirmed
        groceryNotice = "Grocery updated. Refreshing the list…"
        await refreshGroceries()
    }

    func discardConflictedGroceryEdit() async {
        guard let offline, let lease, let groceryEdit, groceryEdit.state == .conflict,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        do {
            try await offline.discardConflictedGroceryEdit(groceryEdit.command.operationId, lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            self.groceryEdit = nil
            groceryNotice = "Rejected edit discarded. Check the latest item before editing again."
            await refreshGroceries()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not discard this edit. Try again."
        }
    }

    private func handleGroceryEditFailure(
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
            await rejectGroceryEdit(offline: offline, lease: lease, member: member, attempt: attempt)
            return
        case .forbidden:
            if await reverifyGroceryMembership(api: api, auth: auth, member: member, attempt: attempt) {
                return
            }
        default: break
        }
        guard generation == attempt, status == .ready(member) else { return }
        groceryNotice = "Could not confirm this edit. Retry the saved request when online."
    }

    private func rejectGroceryEdit(
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async {
        do {
            if let saved = try await offline.readGroceryEdit(lease), saved.state == .pending {
                try await offline.conflictGroceryEdit(
                    saved.command.operationId, reason: "rejected", lease: lease)
            }
            let rejected = try await offline.readGroceryEdit(lease)
            guard generation == attempt, status == .ready(member) else { return }
            groceryEdit = rejected
            groceryNotice = "This edit was rejected. Review the latest item before trying again."
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save the rejection. Reopen Nest to review it."
        }
    }
}
