import Auth
import Foundation
import XCTest

@testable import Nest

final class LateAuthRefreshTests: XCTestCase {
    private typealias F = PushAuthFixture

    func testLateRefreshCannotRestoreCredentialsAfterLocalSignOut() async throws {
        let fixture = try fixture()
        defer { try? fixture.storage.remove(key: "fixture") }
        let refresh = Task { try await fixture.auth.session() }
        await fixture.server.waitForRefresh()
        let earlyLogout = expectation(description: "Logout must await the in-flight refresh")
        earlyLogout.isInverted = true
        await fixture.server.observeCredentialMutation(earlyLogout)
        let logout = Task { try await fixture.auth.signOut() }
        await fulfillment(of: [earlyLogout], timeout: 0.2)
        await fixture.server.observeCredentialMutation(nil)
        await fixture.server.releaseRefresh()
        _ = try await refresh.value
        try await logout.value
        XCTAssertNil(try fixture.storage.retrieve(key: "fixture"), "Late refresh must not undo sign-out.")
        let cached = await fixture.auth.cachedSession()
        XCTAssertNil(cached)
    }

    func testLateRefreshCannotReplaceTheNewSignedInAccount() async throws {
        let fixture = try fixture()
        defer { try? fixture.storage.remove(key: "fixture") }
        let refresh = Task { try await fixture.auth.session() }
        await fixture.server.waitForRefresh()
        let earlySignIn = expectation(description: "Sign-in must await the in-flight refresh")
        earlySignIn.isInverted = true
        await fixture.server.observeCredentialMutation(earlySignIn)
        let signIn = Task { try await fixture.auth.signIn(appleIDToken: "fictional", nonce: "fictional") }
        await fulfillment(of: [earlySignIn], timeout: 0.2)
        await fixture.server.observeCredentialMutation(nil)
        await fixture.server.releaseRefresh()
        _ = try await refresh.value
        let signedIn = try await signIn.value
        XCTAssertEqual(signedIn.userId, F.id(2))
        let cached = await fixture.auth.cachedSession()
        XCTAssertEqual(cached?.userId, F.id(2), "Late refresh must not replace the new account.")
    }

    private func fixture() throws -> Fixture {
        let storage = SecureAuthStorage(service: "ch.drrius.nest.test.late-refresh.\(UUID())")
        try storage.store(key: "fixture", value: JSONEncoder().encode(F.session(expired: true)))
        let server = LateAuthRefreshServer()
        let client = AuthClient(
            url: URL(string: "https://auth.example.test/auth/v1")!, headers: ["apikey": "sb_publishable_fixture"],
            storageKey: "fixture", localStorage: storage,
            fetch: { request in try await server.respond(request) }, autoRefreshToken: false)
        return Fixture(
            storage: storage, server: server,
            auth: NestAuth(
                client: client, storage: storage, storageKey: "fixture", pushCleanup: nil, pushEnabled: false))
    }

    private struct Fixture {
        let storage: SecureAuthStorage
        let server: LateAuthRefreshServer
        let auth: NestAuth
    }
}

private actor LateAuthRefreshServer {
    private var started = false
    private var waiting: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?
    private var credentialMutation: XCTestExpectation?

    func observeCredentialMutation(_ expectation: XCTestExpectation?) {
        credentialMutation = expectation
    }

    func waitForRefresh() async {
        if started { return }
        await withCheckedContinuation { waiting = $0 }
    }

    func releaseRefresh() {
        response?.resume()
        response = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        var body = Data()
        let logout = request.url!.path.hasSuffix("logout")
        let refresh = (request.url!.query ?? "").contains("grant_type=refresh_token")
        if !refresh { credentialMutation?.fulfill() }
        if !logout {
            if refresh {
                await withCheckedContinuation {
                    response = $0
                    started = true
                    waiting?.resume()
                    waiting = nil
                }
            }
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            encoder.dateEncodingStrategy = .iso8601
            body = try encoder.encode(PushAuthFixture.session(actor: PushAuthFixture.id(refresh ? 1 : 2)))
        }
        return (
            body,
            HTTPURLResponse(
                url: request.url!, statusCode: logout ? 204 : 200, httpVersion: nil,
                headerFields: ["Content-Type": "application/json"])!
        )
    }
}
