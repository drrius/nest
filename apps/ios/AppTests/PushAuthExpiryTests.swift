import Auth
import Foundation
import XCTest

@testable import Nest

final class PushAuthExpiryTests: XCTestCase {
    private typealias F = PushAuthFixture

    func testExpiredOfflineCredentialsRetainLogoutIntentBeforeRefreshAndNeverShowCachedAccount() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-auth-expiry-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.push-expiry.\(UUID())")
        defer { try? storage.remove(key: "fixture") }
        let store = try ChoreOfflineStore(url: url)
        let server = PushAuthServer()
        let auth = F.auth(storage: storage, server: server, cleanup: try F.cleanup(store: store, server: server))
        await server.next(F.session(expired: true))
        _ = try await auth.signIn(appleIDToken: "fictional", nonce: "fictional")
        await server.failRefresh()
        do {
            try await auth.signOut()
            XCTFail("Confirmed offline logout without revocation")
        } catch {}
        let pending = try await store.pendingPushLogouts(actor: F.id(1))
        XCTAssertEqual(pending, [.init(actorId: F.id(1), sessionId: F.id(55), receipt: nil)])
        let cached = await auth.cachedSession()
        XCTAssertNil(cached)
        XCTAssertNotNil(try storage.retrieve(key: "fixture"))
        let calls = await server.calls
        XCTAssertTrue(calls.allSatisfy { $0 == "token" })
        let fenced = try await store.hasPendingPushCleanup()
        XCTAssertTrue(fenced)
    }
}
