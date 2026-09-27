import Foundation
import XCTest

@testable import Nest

private enum FakeAuthError: Error { case invalidRefresh }

private actor FakeAuthentication: NestAuthentication {
    private var active: AuthenticatedSession?
    private var cached: AuthenticatedSession?
    private var nextSignIn: AuthenticatedSession?
    private var invalidRefresh = false

    init(active: AuthenticatedSession, nextSignIn: AuthenticatedSession? = nil) {
        self.active = active
        cached = active
        self.nextSignIn = nextSignIn
    }

    func session() async throws -> AuthenticatedSession {
        if invalidRefresh { throw FakeAuthError.invalidRefresh }
        guard let active else { throw NestAPIFailure.signedOut }
        return active
    }

    func cachedSession() async -> AuthenticatedSession? { cached }

    func signIn(appleIDToken: String, nonce: String) async throws -> AuthenticatedSession {
        guard let nextSignIn else { throw FakeAuthError.invalidRefresh }
        active = nextSignIn
        cached = nextSignIn
        return nextSignIn
    }

    func signOut() async throws {
        active = nil
        cached = nil
    }

    func failRefresh() { invalidRefresh = true }
}

private actor FakeChoreServer {
    let actorA: UUID
    let actorB: UUID
    let household: UUID
    private var denyA = false
    private var unavailable = false
    private var pauseB = false
    private var bWaiting = false
    private var bStarted: CheckedContinuation<Void, Never>?
    private var bResume: CheckedContinuation<Void, Never>?

    init(actorA: UUID, actorB: UUID, household: UUID) {
        self.actorA = actorA
        self.actorB = actorB
        self.household = household
    }

    func denyActorA() { denyA = true }
    func makeUnavailable() { unavailable = true }
    func pauseActorB() { pauseB = true }

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

@MainActor
final class SessionModelTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    private func store() throws -> ChoreOfflineStore {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return try ChoreOfflineStore(url: directory.appending(path: "offline.sqlite"))
    }

    private func api(server: FakeChoreServer) throws -> ChoreAPI {
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await server.respond(request)
        }
        return ChoreAPI(http: http)
    }

    func testAccountARejectionCannotDisplayItsChoresDuringBSignIn() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let store = try store()
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: store)
        await model.restore()
        guard case .loaded(let initial) = model.today else { return XCTFail("A did not load") }
        XCTAssertEqual(initial.chores.first?.chore.title, "Alex chore")
        await server.denyActorA()
        await model.refreshToday()
        XCTAssertEqual(model.status, .signedOut)
        XCTAssertEqual(model.today, .idle)
        await server.pauseActorB()
        let signIn = Task { await model.signIn(idToken: "B", nonce: "test") }
        await server.waitForActorB()
        XCTAssertEqual(
            model.status,
            .ready(
                VerifiedMember(
                    userId: actorB, householdId: household, displayName: "Sam")))
        XCTAssertEqual(model.today, .loading)
        await server.releaseActorB()
        await signIn.value
        guard case .loaded(let current) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(current.chores.first?.chore.title, "Sam chore")
        let old = try await store.cachedMember(actor: actorA)
        XCTAssertNil(old)
    }

    func testColdOfflineRestoreShowsOnlyVerifiedCachedAccount() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let store = try store()
        let member = VerifiedMember(userId: actorA, householdId: household, displayName: "Alex")
        let lease = try await store.activate(member)
        try await store.save(try await server.cachedSnapshot(for: actorA), lease: lease)
        await server.makeUnavailable()
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"))
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: store)
        await model.restore()
        XCTAssertEqual(model.status, .ready(member))
        guard case .loaded(let saved) = model.today else { return XCTFail("Cache not shown") }
        XCTAssertEqual(saved.chores.first?.chore.title, "Alex chore")
        XCTAssertNotNil(model.todayNotice)
    }

    func testInvalidRefreshCanClearLocalSession() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"))
        await auth.failRefresh()
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: try store())
        await model.restore()
        XCTAssertEqual(model.status, .unavailable)
        await model.signOut()
        XCTAssertEqual(model.status, .signedOut)
        let cached = await auth.cachedSession()
        XCTAssertNil(cached)
    }
}
