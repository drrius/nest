import Foundation
import XCTest

@testable import NestCore

final class PushLogoutTests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    private static func token(actor: UUID, session: UUID) -> String {
        let claims = "{\"sub\":\"\(actor.uuidString)\",\"session_id\":\"\(session.uuidString)\"}"
        let payload = Data(claims.utf8).base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return "e30.\(payload).fictional_signature"
    }

    func testClaimsAreOnlyReceiptExpectationsAndRefuseMalformedOrForeignActors() throws {
        let token = Self.token(actor: F.member.userId, session: F.id(55))
        let identity = try PushTokenIdentity(token: token, expectedActor: F.member.userId)
        XCTAssertEqual(identity.actor, F.member.userId)
        XCTAssertEqual(identity.session, F.id(55))
        for bad in [
            "", ".payload.sig", "e30.e30.sig", "e30.%%.sig", token + "\n", token + ".extra",
            String(repeating: "a", count: 16_385),
        ] {
            XCTAssertThrowsError(try PushTokenIdentity(token: bad, expectedActor: F.member.userId))
        }
        XCTAssertThrowsError(try PushTokenIdentity(token: token, expectedActor: F.id(2)))
    }

    func testCurrentAndOlderSessionRevocationUsesVerifiedAuthRPCWithoutHouseholdMembership() async throws {
        let actor = F.member.userId
        let current = F.id(55)
        let previous = F.id(54)
        let token = Self.token(actor: actor, session: current)
        let api = try PushLogoutAPI(
            origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
        ) { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.timeoutInterval, 15)
            XCTAssertFalse(request.httpShouldHandleCookies)
            XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(token)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "apikey"), "sb_publishable_fixture")
            XCTAssertNil(request.value(forHTTPHeaderField: "X-Nest-Household"))
            let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: String]
            let older = request.url!.path.hasSuffix("nest_revoke_previous_push_session")
            XCTAssertEqual(request.url!.host, "auth.example.test")
            XCTAssertEqual(body, older ? ["p_session": previous.uuidString.lowercased()] : [:])
            if !older { XCTAssertEqual(request.url!.path, "/rest/v1/rpc/nest_revoke_push_session") }
            return Self.response(
                request, status: 200,
                receipt: .init(version: 1, actorId: actor, sessionId: older ? previous : current, revoked: true))
        }
        let first = try await api.revoke(token: token, actor: actor)
        XCTAssertEqual(first.sessionId, current)
        let recovered = try await api.revoke(token: token, actor: actor, previousSession: previous)
        XCTAssertEqual(recovered.sessionId, previous)
    }

    func testNoForeignSessionWrongVersionFalseConsentOrExtraFieldCanCompleteLogout() async throws {
        let actor = F.member.userId
        let session = F.id(55)
        let token = Self.token(actor: F.member.userId, session: F.id(55))
        let good = PushSessionRevocation(version: 1, actorId: actor, sessionId: session, revoked: true)
        for patch: [String: Any] in [
            ["version": 2], ["actorId": F.id(2).uuidString], ["sessionId": F.id(56).uuidString], ["revoked": false],
            ["token": "do-not-accept"], ["revoked": "true"],
        ] {
            var object = try JSONSerialization.jsonObject(with: JSONEncoder().encode(good)) as! [String: Any]
            object.merge(patch) { _, value in value }
            let data = try JSONSerialization.data(withJSONObject: object)
            let api = try PushLogoutAPI(
                origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
            ) { request in
                (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            do {
                _ = try await api.revoke(token: token, actor: actor)
                XCTFail("Accepted substituted receipt")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        }
    }

    func testMissingCredentialsRedirectOversizeAndUnknownResponsesNeverConfirmOrRetry() async throws {
        for origin in [
            "http://auth.example.test", "https://user:pass@auth.example.test", "https://auth.example.test/path",
        ] {
            XCTAssertThrowsError(
                try PushLogoutAPI(origin: URL(string: origin)!, publishableKey: "sb_publishable_fixture"))
        }
        let calls = PushLogoutCalls()
        let api = try PushLogoutAPI(
            origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
        ) { _ in
            await calls.increment()
            throw URLError(.networkConnectionLost)
        }
        do {
            _ = try await api.revoke(token: "bad", actor: F.member.userId)
            XCTFail("Dispatched invalid identity")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        let initially = await calls.count
        XCTAssertEqual(initially, 0)
        do {
            _ = try await api.revoke(
                token: Self.token(actor: F.member.userId, session: F.id(55)), actor: F.member.userId)
            XCTFail("Confirmed unknown revocation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let final = await calls.count
        XCTAssertEqual(final, 1)
        for status in [302, 401, 403, 503, 200] {
            let api = try PushLogoutAPI(
                origin: URL(string: "https://auth.example.test")!, publishableKey: "sb_publishable_fixture"
            ) { request in
                (
                    Data(repeating: 0, count: status == 200 ? 4097 : 0),
                    HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
                )
            }
            do {
                _ = try await api.revoke(
                    token: Self.token(actor: F.member.userId, session: F.id(55)), actor: F.member.userId)
                XCTFail("Accepted failure")
            } catch {
                XCTAssertEqual(
                    error as? NestAPIFailure, status == 401 ? .signedOut : status == 403 ? .forbidden : .unavailable)
            }
        }
    }

    private static func response(_ request: URLRequest, status: Int, receipt: PushSessionRevocation) -> (
        Data, URLResponse
    ) {
        (
            try! JSONEncoder().encode(receipt),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        )
    }
}

private actor PushLogoutCalls {
    var count = 0
    func increment() { count += 1 }
}
