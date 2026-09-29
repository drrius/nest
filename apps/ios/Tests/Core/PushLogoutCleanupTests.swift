import Foundation
import XCTest

@testable import NestCore

final class PushLogoutCleanupTests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    func testLostReplyRetainsExactSessionAndFreshSameActorRecoveryNeverRevokesNewSession() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-logout-cleanup-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let actor = F.member.userId
        let old = F.id(55)
        let fresh = F.id(56)
        let server = PushLogoutTestServer(actor: actor, old: old, fresh: fresh)
        let api = try PushLogoutAPI(
            origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
        ) { request in
            try await server.respond(request)
        }
        let cleanup = PushLogoutCleanup(api: api, store: store)
        do {
            _ = try await cleanup.stop(token: Self.token(actor: actor, session: old), actor: actor, session: old)
            XCTFail("Confirmed lost reply")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await store.pendingPushLogouts(actor: actor)
        XCTAssertEqual(pending, [.init(actorId: actor, sessionId: old, receipt: nil)])
        let restarted = try ChoreOfflineStore(url: url)
        let recovery = PushLogoutCleanup(api: api, store: restarted)
        let receipt = try await recovery.stop(
            token: Self.token(actor: actor, session: fresh), actor: actor, session: old)
        XCTAssertEqual(receipt.sessionId, old)
        let saved = try await restarted.pendingPushLogouts(actor: actor)
        XCTAssertEqual(saved.first?.receipt, receipt)
        _ = try await recovery.stop(token: Self.token(actor: actor, session: fresh), actor: actor, session: old)
        let requests = await server.requests
        XCTAssertEqual(requests, ["nest_revoke_push_session", "nest_revoke_previous_push_session"])
        let metadata = String(decoding: try JSONEncoder().encode(saved), as: UTF8.self)
        XCTAssertFalse(metadata.contains("fictional_signature"))
        XCTAssertFalse(metadata.contains("access_token"))
        // No finish: the Auth layer must separately confirm Keychain credential removal.
    }

    func testForeignActorIsRejectedBeforeJournalingOrCallingServer() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-logout-foreign-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let api = try PushLogoutAPI(
            origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
        ) { _ in
            XCTFail("Sent unrelated actor cleanup")
            throw NestAPIFailure.contract
        }
        do {
            _ = try await PushLogoutCleanup(api: api, store: store).stop(
                token: Self.token(actor: F.id(2), session: F.id(55)), actor: F.member.userId, session: F.id(55))
            XCTFail("Staged foreign cleanup")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        let pending = try await store.pendingPushLogouts(actor: F.member.userId)
        XCTAssertTrue(pending.isEmpty)
    }

    private static func token(actor: UUID, session: UUID) -> String {
        let claims = "{\"sub\":\"\(actor.uuidString)\",\"session_id\":\"\(session.uuidString)\"}"
        let payload = Data(claims.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "e30.\(payload).fictional_signature"
    }
}

private actor PushLogoutTestServer {
    let actor: UUID
    let old: UUID
    let fresh: UUID
    var requests: [String] = []
    init(actor: UUID, old: UUID, fresh: UUID) {
        self.actor = actor
        self.old = old
        self.fresh = fresh
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        requests.append(request.url!.lastPathComponent)
        if requests.count == 1 { throw URLError(.networkConnectionLost) }
        XCTAssertEqual(request.url!.lastPathComponent, "nest_revoke_previous_push_session")
        let input = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
        XCTAssertEqual(input, ["p_session": old.uuidString.lowercased()])
        XCTAssertNotEqual(input["p_session"], fresh.uuidString.lowercased())
        let receipt = PushSessionRevocation(version: 1, actorId: actor, sessionId: old, revoked: true)
        return (
            try JSONEncoder().encode(receipt),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
