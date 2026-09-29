import Auth
import Foundation
import XCTest

@testable import Nest

final class PushAuthTests: XCTestCase {
    private typealias F = PushAuthFixture

    func testLostRevocationKeepsKeychainButHidesCachedAccountAndRestartFinishesOriginalLogout() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-auth.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let cleanup = try F.cleanup(store: store, server: server)
        let auth = F.auth(storage: storage, server: server, cleanup: cleanup)
        _ = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        await server.loseNextPushReply()
        do {
            try await auth.signOut()
            XCTFail("Confirmed lost revocation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        XCTAssertNotNil(try storage.retrieve(key: "fixture"))
        let cached = await auth.cachedSession()
        XCTAssertNil(cached)
        let pending = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertEqual(pending, [.init(actorId: F.id(1), sessionId: F.id(55), receipt: nil)])
        let restarted = F.auth(storage: storage, server: server, cleanup: cleanup, pushEnabled: false)
        do {
            _ = try await restarted.session()
            XCTFail("Reopened logged-out account")
        } catch AuthError.sessionMissing {} catch { XCTFail("Unexpected cleanup failure: \(type(of: error))") }
        XCTAssertNil(try storage.retrieve(key: "fixture"))
        let remaining = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertTrue(remaining.isEmpty)
        let calls = await server.calls
        XCTAssertEqual(calls, ["token", "nest_revoke_push_session", "nest_revoke_push_session", "logout"])
    }

    func testFreshSameActorSignInRevokesOnlyOldSessionAndKeepsNewPersistedCredentials() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-recovery.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let auth = F.auth(storage: storage, server: server, cleanup: try F.cleanup(store: store, server: server))
        _ = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        try await store.trackPushSession(actor: F.id(1), session: F.id(55))
        await server.loseNextPushReply()
        do {
            try await auth.signOut()
            XCTFail("Confirmed lost reply")
        } catch {}
        await server.next(F.session(session: F.id(56)))
        let recovered = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        let persisted = try JSONDecoder().decode(Session.self, from: storage.retrieve(key: "fixture")!)
        XCTAssertEqual(persisted.accessToken, recovered.accessToken)
        let identity = try PushTokenIdentity(token: recovered.accessToken, expectedActor: F.id(1))
        XCTAssertEqual(identity.session, F.id(56))
        let revoked = await server.revoked
        XCTAssertEqual(revoked, [F.id(55)])
        let pending = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertTrue(pending.isEmpty)
        let tracked = try await store.trackedPushSessions(actor: F.id(1))
        XCTAssertTrue(tracked.isEmpty)
        let ready = try await auth.session()
        XCTAssertEqual(ready.accessToken, recovered.accessToken)
    }

    func testDifferentActorCannotClearPriorCleanupAndEnrollmentMustRemainFenced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-partner-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-partner.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let auth = F.auth(storage: storage, server: server, cleanup: try F.cleanup(store: store, server: server))
        try await store.stagePushLogout(actor: F.id(1), session: F.id(55))
        await server.next(F.session(actor: F.id(2), session: F.id(57)))
        let partner = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        XCTAssertEqual(partner.userId, F.id(2))
        let previous = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertEqual(previous, [.init(actorId: F.id(1), sessionId: F.id(55), receipt: nil)])
        let fenced = try await store.hasPendingPushCleanup()
        XCTAssertTrue(fenced)
        let calls = await server.calls
        XCTAssertEqual(calls, ["token"])
    }

    func testRevocationPrecedesSDKCredentialRemovalAndRemoteLogoutFailureDoesNotUndoLocalEvidence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-order-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-order.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let auth = F.auth(
            storage: storage, server: server, cleanup: try F.cleanup(store: store, server: server), pushEnabled: false)
        _ = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        try await store.trackPushSession(actor: F.id(1), session: F.id(55))
        await server.failRemoteLogout()
        try await auth.signOut()
        XCTAssertNil(try storage.retrieve(key: "fixture"))
        let calls = await server.calls
        // The pinned Auth SDK retries its unavailable remote logout once; push revocation happens only once, first.
        XCTAssertEqual(calls, ["token", "nest_revoke_push_session", "logout", "logout"])
        let pending = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertTrue(pending.isEmpty)
        let tracked = try await store.trackedPushSessions(actor: F.id(1))
        XCTAssertTrue(tracked.isEmpty)
    }

    func testDisabledUnenrolledBuildDoesNotDependOnUndeployedPushRPCs() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-disabled-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-disabled.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let auth = F.auth(
            storage: storage, server: server, cleanup: try F.cleanup(store: store, server: server), pushEnabled: false)
        _ = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        try await auth.signOut()
        XCTAssertNil(try storage.retrieve(key: "fixture"))
        let calls = await server.calls
        XCTAssertEqual(calls, ["token", "logout"])
    }
}
