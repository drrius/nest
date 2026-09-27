import Foundation
import XCTest

@testable import Nest

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

    func testOverlappingSignInsLeaveDisplayAndCredentialsOnLatestAccount() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        await auth.pauseActorA()
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: try store())
        let oldSignIn = Task { await model.signIn(idToken: "A", nonce: "test") }
        await auth.waitForActorA()
        let newSignIn = Task { await model.signIn(idToken: "B", nonce: "test") }
        for _ in 0..<100 where model.credentialSequence < 2 { await Task.yield() }
        XCTAssertEqual(model.credentialSequence, 2)
        await auth.releaseActorA()
        await oldSignIn.value
        await newSignIn.value
        XCTAssertEqual(
            model.status,
            .ready(VerifiedMember(userId: actorB, householdId: household, displayName: "Sam")))
        let stored = await auth.cachedSession()
        XCTAssertEqual(stored?.userId, actorB)
        guard case .loaded(let current) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(current.chores.first?.chore.title, "Sam chore")
    }

    func testSecondRestoreCannotBeReplacedByDelayedFirstRestore() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let first = AuthenticatedSession(userId: actorA, accessToken: "token-A")
        let second = AuthenticatedSession(userId: actorB, accessToken: "token-B")
        let auth = FakeAuthentication(active: first)
        await auth.queueSessions([first, second])
        await server.pauseActorASession()
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: try store())
        let oldRestore = Task { await model.restore() }
        await server.waitForActorASession()
        await model.restore()
        guard case .loaded(let before) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(before.chores.first?.chore.title, "Sam chore")
        await server.releaseActorASession()
        await oldRestore.value
        XCTAssertEqual(
            model.status,
            .ready(VerifiedMember(userId: actorB, householdId: household, displayName: "Sam")))
        guard case .loaded(let after) = model.today else { return XCTFail("A replaced B") }
        XCTAssertEqual(after.chores.first?.chore.title, "Sam chore")
        let stored = await auth.cachedSession()
        XCTAssertEqual(stored?.userId, actorB)
    }

    func testPausedAccountAReadCannotReplaceAccountBPresentation() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let reader = PausedSavedRead()
        let model = SessionModel(
            auth: auth, chores: try api(server: server), offline: try store(),
            savedReader: { store, lease in try await reader.read(store, lease: lease) })
        await model.restore()
        await reader.pauseNext()
        let oldRefresh = Task { await model.refreshToday() }
        await reader.waitUntilPaused()
        await model.signIn(idToken: "B", nonce: "test")
        guard case .loaded(let before) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(before.chores.first?.chore.title, "Sam chore")
        await reader.release()
        await oldRefresh.value
        guard case .loaded(let after) = model.today else { return XCTFail("A replaced B") }
        XCTAssertEqual(after.chores.first?.chore.title, "Sam chore")
    }

    func testPausedAccountACompletionCannotReplaceAccountBPresentation() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let reader = PausedSavedRead()
        let model = SessionModel(
            auth: auth, chores: try api(server: server), offline: try store(),
            savedReader: { store, lease in try await reader.read(store, lease: lease) })
        await model.restore()
        guard case .loaded(let initial) = model.today,
            let chore = initial.chores.first?.chore
        else { return XCTFail("A did not load") }
        await reader.pauseNext()
        let oldCompletion = Task { await model.complete(chore) }
        await reader.waitUntilPaused()
        await model.signIn(idToken: "B", nonce: "test")
        await reader.release()
        await oldCompletion.value
        guard case .loaded(let current) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(current.chores.first?.chore.title, "Sam chore")
        XCTAssertNil(model.todayNotice)
    }

    func testPausedAccountADeactivationCannotSignOutAccountB() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let deactivation = PausedDeactivation()
        let model = SessionModel(
            auth: auth, chores: try api(server: server), offline: try store(),
            deactivateLease: { store, lease in try await deactivation.deactivate(store, lease: lease) })
        await model.restore()
        await deactivation.pauseNext()
        await server.denyActorA()
        let oldRefresh = Task { await model.refreshToday() }
        await deactivation.waitUntilPaused()
        await model.signIn(idToken: "B", nonce: "test")
        await deactivation.release()
        await oldRefresh.value
        XCTAssertEqual(
            model.status,
            .ready(VerifiedMember(userId: actorB, householdId: household, displayName: "Sam")))
        guard case .loaded(let current) = model.today else { return XCTFail("B did not load") }
        XCTAssertEqual(current.chores.first?.chore.title, "Sam chore")
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

    func testReadyAccountCanReverifyFromSavedDataWhenOffline() async throws {
        let server = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"))
        let model = SessionModel(auth: auth, chores: try api(server: server), offline: try store())
        await model.restore()
        await server.makeUnavailable()
        await model.restore()
        XCTAssertEqual(
            model.status,
            .ready(VerifiedMember(userId: actorA, householdId: household, displayName: "Alex")))
        guard case .loaded(let saved) = model.today else { return XCTFail("Saved chores were lost") }
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
