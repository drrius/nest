import Foundation
import UIKit

extension SessionModel {
    func refreshGroceries() async {
        if grocerySyncingGeneration == generation {
            groceryNeedsRefresh = true
            return
        }
        guard let auth, let groceryAPI, let offline, let lease,
            case .ready(let member) = status
        else { return }
        let attempt = generation
        grocerySyncingGeneration = attempt
        defer { finishGroceryRefresh(attempt: attempt) }
        do {
            try await showSavedGroceries(offline: offline, lease: lease, member: member, attempt: attempt)
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceries = .failed
            groceryNotice = "Could not read your saved groceries."
            return
        }
        guard generation == attempt, status == .ready(member) else { return }
        do {
            try await syncGroceries(
                auth: auth, api: groceryAPI, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleGroceryFailure(error, member: member, attempt: attempt)
        }
    }

    private func showSavedGroceries(
        offline: ChoreOfflineStore, lease: OfflineLease,
        member: VerifiedMember, attempt: Int
    ) async throws {
        let saved = try await offline.readGroceries(lease)
        let savedAdd = try await offline.readGroceryAdd(lease)
        let savedEdit = try await offline.readGroceryEdit(lease)
        let savedRemove = try await offline.readGroceryRemove(lease)
        guard generation == attempt, status == .ready(member) else { return }
        groceries = saved.map(GroceryStatus.loaded) ?? .loading
        groceryAdd = savedAdd
        groceryEdit = savedEdit
        groceryRemove = savedRemove
    }

    func checkGrocery(_ item: GroceryItem, checked: Bool) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.enqueueGroceryCheck(item, checked: checked, operation: UUID(), lease: lease)
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not save this change. Refresh and try again."
            return
        }
        guard generation == attempt, status == .ready(member) else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        do {
            let saved = try await offline.readGroceries(lease)
            guard generation == attempt, status == .ready(member) else { return }
            if let saved { groceries = .loaded(saved) }
            groceryNotice = "Saved on this device. Checking with your household…"
            await refreshGroceries()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Saved on this device, but could not display the change. Reopen Nest to retry."
        }
    }

    func discardGroceryCheck(_ operation: UUID) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discardGroceryCheck(operation, lease: lease)
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Could not discard this change. Please try again."
            return
        }
        do {
            let saved = try await offline.readGroceries(lease)
            guard generation == attempt, status == .ready(member) else { return }
            if let saved { groceries = .loaded(saved) }
            groceryNotice = "Saved change discarded."
            await refreshGroceries()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            groceryNotice = "Change discarded, but the list could not refresh. Reopen Nest to retry."
        }
    }

    private func finishGroceryRefresh(attempt: Int) {
        guard grocerySyncingGeneration == attempt else { return }
        grocerySyncingGeneration = nil
        if groceryNeedsRefresh, generation == attempt {
            groceryNeedsRefresh = false
            Task { await refreshGroceries() }
        }
    }

    private func syncGroceries(
        auth: any NestAuthentication, api: GroceryAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let (snapshot, conflicted) = try await GrocerySync(api: api, store: offline)
            .replayAndRead(token: session.accessToken, member: member, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.saveGroceries(snapshot, lease: lease)
        guard let saved = try await offline.readGroceries(lease),
            generation == attempt, status == .ready(member)
        else { return }
        groceries = .loaded(saved)
        let savedAdd = try await offline.readGroceryAdd(lease)
        let savedEdit = try await offline.readGroceryEdit(lease)
        let savedRemove = try await offline.readGroceryRemove(lease)
        guard generation == attempt, status == .ready(member) else { return }
        groceryAdd = savedAdd
        groceryEdit = savedEdit
        groceryRemove = savedRemove
        groceryNotice = conflicted ? "A saved grocery change needs review." : nil
    }

    private func handleGroceryFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
        guard generation == attempt, status == .ready(member) else { return }
        let mapped = state(for: error)
        if mapped == .signedOut || mapped == .notMember {
            generation += 1
            let clearAttempt = generation
            await clearPresentation()
            guard generation == clearAttempt else { return }
            status = mapped
            return
        }
        if case .loaded = groceries {
            groceryNotice =
                (error as? NestAPIFailure) == .forbidden
                ? "A saved change was refused. Your access may have changed; no change was discarded."
                : "Showing saved groceries. Changes will sync when online."
        } else {
            groceries = .failed
            groceryNotice = nil
        }
    }
}
