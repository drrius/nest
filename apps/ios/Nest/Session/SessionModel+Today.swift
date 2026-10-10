import Foundation

extension SessionModel {
    func refreshToday() async {
        guard let auth, let chores, let offline, let lease, case .ready(let member) = status else { return }
        if syncingGeneration == generation {
            todayNeedsRefresh = true
            return
        }
        let attempt = generation
        syncingGeneration = attempt
        // An accepted refresh owns its finite replay independently of the presenting view's task.
        // Account/lease guards still fence every response and the next queued operation.
        let work = Task {
            await drainTodayRefresh(
                auth: auth, chores: chores, offline: offline, lease: lease, member: member, attempt: attempt)
        }
        await work.value
    }

    private func drainTodayRefresh(
        auth: any NestAuthentication, chores: ChoreAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        defer {
            if syncingGeneration == attempt { syncingGeneration = nil }
        }
        repeat {
            todayNeedsRefresh = false
            await refreshTodayOnce(
                auth: auth, chores: chores, offline: offline, lease: lease, member: member, attempt: attempt)
            guard generation == attempt, status == .ready(member) else { return }
        } while todayNeedsRefresh
    }

    private func refreshTodayOnce(
        auth: any NestAuthentication, chores: ChoreAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async {
        let saved: ChoreOfflineState?
        do {
            saved = try await savedReader(offline, lease)
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            today = .failed
            todayNotice = "Could not read your saved chores."
            return
        }
        guard generation == attempt, status == .ready(member) else { return }
        today = saved.map(TodayStatus.loaded) ?? .loading
        do {
            try await syncToday(
                auth: auth, chores: chores, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleTodayFailure(error, member: member, attempt: attempt)
        }
    }

    private func syncToday(
        auth: any NestAuthentication, chores: ChoreAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        let session = try await auth.session()
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let (snapshot, conflicted) = try await ChoreSync(api: chores, store: offline)
            .replayAndRead(token: session.accessToken, member: member, lease: lease)
        guard generation == attempt, status == .ready(member) else { return }
        try await offline.save(snapshot, lease: lease)
        guard let saved = try await offline.read(lease),
            generation == attempt, status == .ready(member)
        else { return }
        today = .loaded(saved)
        todayNotice = conflicted ? "A saved change needs your review." : nil
    }

    private func handleTodayFailure(_ error: Error, member: VerifiedMember, attempt: Int) async {
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
        if case .loaded = today {
            todayNotice =
                (error as? NestAPIFailure) == .forbidden
                ? "A saved change was refused. Your access may have changed; no change was discarded."
                : "Showing saved chores. Changes will sync when online."
        } else {
            today = .failed
            todayNotice = nil
        }
    }

}
