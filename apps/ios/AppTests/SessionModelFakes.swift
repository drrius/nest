import Foundation

@testable import Nest

enum FakeAuthError: Error { case invalidRefresh }

actor FakeAuthentication: NestAuthentication {
    private var active: AuthenticatedSession?
    private var cached: AuthenticatedSession?
    private var nextSignIn: AuthenticatedSession?
    private let initial: AuthenticatedSession
    private var invalidRefresh = false
    private var pauseA = false
    private var aWaiting = false
    private var aStarted: CheckedContinuation<Void, Never>?
    private var aResume: CheckedContinuation<Void, Never>?
    private var sessionReplies: [AuthenticatedSession] = []

    init(active: AuthenticatedSession, nextSignIn: AuthenticatedSession? = nil) {
        self.active = active
        cached = active
        initial = active
        self.nextSignIn = nextSignIn
    }

    func session() async throws -> AuthenticatedSession {
        if invalidRefresh { throw FakeAuthError.invalidRefresh }
        if !sessionReplies.isEmpty {
            let next = sessionReplies.removeFirst()
            active = next
            cached = next
            return next
        }
        guard let active else { throw NestAPIFailure.signedOut }
        return active
    }

    func cachedSession() async -> AuthenticatedSession? { cached }

    func signIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession {
        if appleIDToken == "A" && pauseA {
            aWaiting = true
            aStarted?.resume()
            aStarted = nil
            await withCheckedContinuation { aResume = $0 }
        }
        guard let session = appleIDToken == "A" ? initial : nextSignIn else {
            throw FakeAuthError.invalidRefresh
        }
        active = session
        cached = session
        return session
    }

    func signOut() async throws {
        active = nil
        cached = nil
    }

    func failRefresh() { invalidRefresh = true }
    func queueSessions(_ sessions: [AuthenticatedSession]) { sessionReplies = sessions }
    func pauseActorA() { pauseA = true }

    func waitForActorA() async {
        if aWaiting { return }
        await withCheckedContinuation { aStarted = $0 }
    }

    func releaseActorA() {
        pauseA = false
        aResume?.resume()
        aResume = nil
    }
}

actor FakeChoreServer {
    let actorA: UUID
    let actorB: UUID
    let household: UUID
    private var denyA = false
    private var unavailable = false
    private var pauseB = false
    private var bWaiting = false
    private var bStarted: CheckedContinuation<Void, Never>?
    private var bResume: CheckedContinuation<Void, Never>?
    private var pauseASession = false
    private var aSessionWaiting = false
    private var aSessionStarted: CheckedContinuation<Void, Never>?
    private var aSessionResume: CheckedContinuation<Void, Never>?

    init(actorA: UUID, actorB: UUID, household: UUID) {
        self.actorA = actorA
        self.actorB = actorB
        self.household = household
    }

    func denyActorA() { denyA = true }
    func makeUnavailable() { unavailable = true }
    func pauseActorB() { pauseB = true }
    func pauseActorASession() { pauseASession = true }

    func waitForActorASession() async {
        if aSessionWaiting { return }
        await withCheckedContinuation { aSessionStarted = $0 }
    }

    func releaseActorASession() {
        aSessionResume?.resume()
        aSessionResume = nil
    }

    func waitForActorB() async {
        if bWaiting { return }
        await withCheckedContinuation { bStarted = $0 }
    }

    func releaseActorB() {
        pauseB = false
        bResume?.resume()
        bResume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if unavailable { throw URLError(.notConnectedToInternet) }
        let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
        let actor = token == "Bearer token-A" ? actorA : actorB
        let isA = actor == actorA
        let path = request.url!.path
        if isA && denyA && path == "/v1/chores/snapshot" {
            return answer(request, status: 401, data: Data())
        }
        if !isA && pauseB && path == "/v1/chores/snapshot" {
            bWaiting = true
            bStarted?.resume()
            bStarted = nil
            await withCheckedContinuation { bResume = $0 }
        }
        if isA && pauseASession && path == "/v1/session" {
            pauseASession = false
            aSessionWaiting = true
            aSessionStarted?.resume()
            aSessionStarted = nil
            await withCheckedContinuation { aSessionResume = $0 }
        }
        if path == "/v1/session" {
            let name = isA ? "Alex" : "Sam"
            let body =
                "{\"version\":1,\"member\":{\"userId\":\"\(actor.uuidString)\",\"householdId\":\"\(household.uuidString)\",\"displayName\":\"\(name)\"}}"
            return answer(request, status: 200, data: Data(body.utf8))
        }
        return answer(request, status: 200, data: try JSONEncoder().encode(snapshot(for: actor)))
    }

    private func snapshot(for actor: UUID) throws -> ChoreSnapshot {
        let isA = actor == actorA
        return ChoreSnapshot(
            version: 1, householdId: household,
            members: [NestMember(actorId: actor, displayName: isA ? "Alex" : "Sam")],
            transfers: [],
            chores: [
                NestChore(
                    occurrenceId: isA ? actorA : actorB,
                    title: isA ? "Alex chore" : "Sam chore",
                    dueDate: try CivilDate("2026-09-28"), assigneeId: actor,
                    offlineEpoch: UUID())
            ])
    }

    func cachedSnapshot(for actor: UUID) throws -> ChoreSnapshot { try snapshot(for: actor) }

    private func answer(_ request: URLRequest, status: Int, data: Data) -> (Data, URLResponse) {
        let response = HTTPURLResponse(
            url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, response)
    }
}

actor PausedSavedRead {
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    func pauseNext() { pause = true }

    func waitUntilPaused() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }

    func release() {
        resume?.resume()
        resume = nil
    }

    func read(_ store: ChoreOfflineStore, lease: OfflineLease) async throws -> ChoreOfflineState? {
        let saved = try await store.read(lease)
        guard pause else { return saved }
        pause = false
        waiting = true
        started?.resume()
        started = nil
        await withCheckedContinuation { resume = $0 }
        return saved
    }
}

actor PausedDeactivation {
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    func pauseNext() { pause = true }

    func waitUntilPaused() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }

    func release() {
        resume?.resume()
        resume = nil
    }

    func deactivate(_ store: ChoreOfflineStore, lease: OfflineLease) async throws {
        try await store.deactivate(lease)
        guard pause else { return }
        pause = false
        waiting = true
        started?.resume()
        started = nil
        await withCheckedContinuation { resume = $0 }
    }
}
