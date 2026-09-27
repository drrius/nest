import Auth
import Foundation
import SwiftUI
import UIKit

@MainActor
final class SessionModel: ObservableObject {
    enum Status: Equatable {
        case configuration, loading, signedOut, notMember, unavailable
        case ready(VerifiedMember)
    }

    enum TodayStatus: Equatable {
        case idle, loading
        case loaded(ChoreOfflineState)
        case failed
    }

    @Published private(set) var status: Status = .loading
    @Published private(set) var today: TodayStatus = .idle
    @Published private(set) var todayNotice: String?
    private let auth: NestAuth?
    private let chores: ChoreAPI?
    private let offline: ChoreOfflineStore?
    private var lease: OfflineLease?
    private var syncing = false
    private var generation = 0

    init() {
        do {
            let configuration = try NestConfiguration.fromBundle()
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
            auth = NestAuth(configuration: configuration)
            chores = ChoreAPI(http: http)
            offline = store
        } catch is NestConfigurationError {
            auth = nil
            chores = nil
            offline = nil
            status = .configuration
        } catch {
            auth = nil
            chores = nil
            offline = nil
            status = .unavailable
        }
    }

    func restore() async {
        guard let auth else { return }
        let attempt = generation
        do {
            let session = try await auth.session()
            try await verify(session, attempt: attempt)
        } catch AuthError.sessionMissing {
            await missingSession(attempt: attempt)
        } catch {
            await failedRestore(error, auth: auth, attempt: attempt)
        }
    }

    private func missingSession(attempt: Int) async {
        guard generation == attempt else { return }
        await clearPresentation()
        status = .signedOut
    }

    private func failedRestore(_ error: Error, auth: NestAuth, attempt: Int) async {
        guard generation == attempt else { return }
        if canShowCached(error), (try? await showCached(auth: auth, attempt: attempt)) == true {
            return
        }
        guard generation == attempt else { return }
        let next = state(for: error)
        if next == .signedOut || next == .notMember { await clearPresentation() }
        status = next
    }

    func signIn(idToken: String, nonce: String) async {
        guard let auth else { return }
        generation += 1
        let attempt = generation
        status = .loading
        await clearPresentation()
        guard generation == attempt else { return }
        do {
            let session = try await auth.signIn(appleIDToken: idToken, nonce: nonce)
            try await verify(session, attempt: attempt)
        } catch {
            if generation == attempt { status = state(for: error) }
        }
    }

    func signOut() async {
        guard let auth else { return }
        generation += 1
        let attempt = generation
        await clearPresentation()
        guard generation == attempt else { return }
        do {
            try await auth.signOut()
            if generation == attempt { status = .signedOut }
        } catch {
            if generation == attempt { status = .unavailable }
        }
    }

    func refreshToday() async {
        guard !syncing, let auth, let chores, let offline, let lease,
            case .ready(let member) = status
        else { return }
        syncing = true
        defer { syncing = false }
        let attempt = generation
        do {
            try await showSaved(offline: offline, lease: lease)
        } catch {
            today = .failed
            todayNotice = "Could not read your saved chores."
            return
        }
        do {
            try await syncToday(
                auth: auth, chores: chores, offline: offline,
                lease: lease, member: member, attempt: attempt)
        } catch {
            await handleTodayFailure(error, member: member, attempt: attempt)
        }
    }

    private func canShowCached(_ error: Error) -> Bool {
        (error as? NestAPIFailure) == .unavailable || error is URLError
    }

    private func showCached(auth: NestAuth, attempt: Int) async throws -> Bool {
        guard let offline, let session = auth.cachedSession(),
            let member = try await offline.cachedMember(actor: session.user.id)
        else { return false }
        guard generation == attempt else { return false }
        await clearPresentation()
        guard generation == attempt else { return false }
        let cachedLease = try await offline.activate(member)
        guard let saved = try await offline.read(cachedLease), generation == attempt else {
            try await offline.deactivate(cachedLease)
            return false
        }
        lease = cachedLease
        today = .loaded(saved)
        todayNotice = "Showing saved chores. Changes will sync when online."
        status = .ready(member)
        return true
    }

    private func clearPresentation() async {
        let previous = lease
        lease = nil
        today = .idle
        todayNotice = nil
        syncing = false
        if let previous, let offline { try? await offline.deactivate(previous) }
    }

    private func showSaved(offline: ChoreOfflineStore, lease: OfflineLease) async throws {
        if let saved = try await offline.read(lease) { today = .loaded(saved) } else { today = .loading }
    }

    private func syncToday(
        auth: NestAuth, chores: ChoreAPI, offline: ChoreOfflineStore,
        lease: OfflineLease, member: VerifiedMember, attempt: Int
    ) async throws {
        let session = try await auth.session()
        guard session.user.id == member.userId else { throw NestAPIFailure.signedOut }
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
            await clearPresentation()
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

    func complete(_ chore: NestChore) async {
        guard let offline, let lease, case .ready = status else { return }
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            let date = try CivilDate(formatter.string(from: .now))
            try await offline.enqueue(chore, on: date, operation: UUID(), lease: lease)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } catch {
            todayNotice = "Could not save this change. Please try again."
            return
        }
        do {
            if let saved = try await offline.read(lease) { today = .loaded(saved) }
            todayNotice = "Saved. This will sync when online."
            await refreshToday()
        } catch {
            todayNotice = "Saved on this device, but could not display the change. Try reopening Nest."
        }
    }

    func discard(_ operation: UUID) async {
        guard let offline, let lease, case .ready = status else { return }
        do {
            try await offline.discard(operation, lease: lease)
            if let saved = try await offline.read(lease) { today = .loaded(saved) }
            todayNotice = "Saved change discarded."
            await refreshToday()
        } catch {
            todayNotice = "Could not discard this change. Please try again."
        }
    }

    private func verify(_ session: Session, attempt: Int) async throws {
        guard let chores, let offline else { throw NestAPIFailure.configuration }
        let member = try await chores.verify(token: session.accessToken, expectedActor: session.user.id)
        guard generation == attempt else { return }
        await clearPresentation()
        guard generation == attempt else { return }
        let nextLease = try await offline.activate(member)
        guard generation == attempt else {
            try? await offline.deactivate(nextLease)
            return
        }
        lease = nextLease
        status = .ready(member)
        await refreshToday()
    }

    private func state(for error: Error) -> Status {
        if let failure = error as? NestAPIFailure {
            if failure == .signedOut { return .signedOut }
            if failure == .notMember { return .notMember }
        }
        return .unavailable
    }
}
