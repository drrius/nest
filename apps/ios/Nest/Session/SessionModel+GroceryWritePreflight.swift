import Foundation

extension SessionModel {
    func prepareGroceryWrite(
        member: VerifiedMember, categoryId: UUID?, item: GroceryItem? = nil, attempt: Int
    ) async throws -> Bool {
        guard let api = groceryAPI,
            let session = try await verifiedGroceryWriteSession(member: member, attempt: attempt)
        else { return false }
        if let item {
            let current = try await api.list(token: session.accessToken, member: member)
            guard generation == attempt, status == .ready(member) else { return false }
            guard let found = current.groceries.first(where: { $0.id == item.id }) else {
                throw NestAPIFailure.removed
            }
            guard found == item else { throw NestAPIFailure.conflict }
        }
        if let categoryId {
            let categories = try await api.categories(token: session.accessToken, member: member).categories
            guard generation == attempt, status == .ready(member) else { return false }
            groceryCategoryStatus = .loaded(categories)
            guard categories.contains(where: { $0.id == categoryId }) else { throw NestAPIFailure.conflict }
        }
        return generation == attempt && status == .ready(member)
    }

    func reloadGroceryForEditing(_ item: GroceryItem) async -> GroceryItem? {
        guard groceryEdit == nil, let api = groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return nil }
        let attempt = generation
        do {
            guard let session = try await verifiedGroceryWriteSession(member: member, attempt: attempt) else {
                return nil
            }
            let current = try await api.list(token: session.accessToken, member: member)
            guard generation == attempt, status == .ready(member) else { return nil }
            guard let found = current.groceries.first(where: { $0.id == item.id }) else {
                throw NestAPIFailure.removed
            }
            let categories = try await api.categories(token: session.accessToken, member: member).categories
            guard generation == attempt, status == .ready(member) else { return nil }
            try await offline.saveGroceries(current, lease: lease)
            let projection = try await offline.readGroceries(lease)
            guard generation == attempt, status == .ready(member) else { return nil }
            if let projection { groceries = .loaded(projection) }
            groceryCategoryStatus = .loaded(categories)
            groceryNotice = "Latest item loaded. Your entries are unchanged. Review them before saving."
            return found
        } catch {
            await handleNewGroceryWriteFailure(
                error, member: member, attempt: attempt,
                notice: "Could not reload this item. Your entries are still here. Try again online.")
            return nil
        }
    }

    private func verifiedGroceryWriteSession(member: VerifiedMember, attempt: Int) async throws
        -> AuthenticatedSession?
    {
        guard let auth, let api = groceryAPI else { throw NestAPIFailure.unavailable }
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let verified = try await api.verify(token: session.accessToken, expectedActor: member.userId)
        guard generation == attempt, status == .ready(member) else { return nil }
        guard verified.householdId == member.householdId else { throw NestAPIFailure.notMember }
        return session
    }

    func handleNewGroceryWriteFailure(_ error: Error, member: VerifiedMember, attempt: Int, notice: String) async {
        guard generation == attempt, status == .ready(member) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            await leaveGroceryAccount(mapped)
        } else if error as? NestAPIFailure == .removed {
            groceryNotice = "This item is no longer on the shared list. No new edit or removal was started."
        } else {
            groceryNotice = notice
        }
    }
}
