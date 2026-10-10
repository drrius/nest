import Auth
import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedSessionRefreshTests: XCTestCase {
    private let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testExistingFictionalSessionRefreshesAtRequestTime() async throws {
        let configuration = try requireFixture()
        let scope = try NestEnvironmentScope(url: configuration.supabaseURL)
        let main = SecureAuthStorage(service: "ch.drrius.nest.auth.\(scope.fingerprint)")
        let key = "nest.auth.\(scope.fingerprint)"
        let original = try read(main, key: key)
        guard original.user.id == actor else { throw FixtureFailure.identity }
        let api = ChoreAPI(http: try NestHTTP(baseURL: configuration.apiURL))
        try await verify(original.accessToken, api: api)
        let temporary = SecureAuthStorage(service: "ch.drrius.nest.test.hosted-refresh.\(UUID())")
        addTeardownBlock {
            try temporary.remove(key: "fixture")
            XCTAssertTrue(try temporary.retrieve(key: "fixture") == nil, "Remove temporary credentials.")
        }
        var expired = original
        expired.expiresAt = Date().timeIntervalSince1970 - 60
        try temporary.store(key: "fixture", value: JSONEncoder().encode(expired))
        XCTAssertTrue(try read(temporary, key: "fixture").isExpired)
        let trace = HostedRefreshTransport(origin: configuration.supabaseURL)
        addTeardownBlock { await trace.close() }
        let client = AuthClient(
            url: configuration.supabaseURL.appending(path: "auth/v1"),
            headers: ["apikey": configuration.publishableKey], storageKey: "fixture", localStorage: temporary,
            fetch: { request in try await trace.fetch(request) }, autoRefreshToken: false)
        let auth = NestAuth(
            client: client, storage: temporary, storageKey: "fixture", pushCleanup: nil, pushEnabled: false)
        do {
            let refreshed = try await auth.session()
            let saved = try read(temporary, key: "fixture")
            guard saved.user.id == actor, refreshed.userId == actor, !saved.isExpired,
                saved.accessToken == refreshed.accessToken
            else { throw FixtureFailure.persistence }
            let before = try PushTokenIdentity(token: original.accessToken, expectedActor: actor)
            let after = try PushTokenIdentity(token: saved.accessToken, expectedActor: actor)
            guard before.session == after.session else { throw FixtureFailure.identity }
            try promote(saved, replacing: original, storage: main, key: key)
            try await verify(refreshed.accessToken, api: api)
            let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
            let reopened = try await NestAuth(configuration: configuration, offline: store).session()
            XCTAssertEqual(reopened.userId, actor)
            XCTAssertTrue(reopened.accessToken == saved.accessToken, "Reopening must retain the refreshed credentials.")
            let statuses = await trace.statuses
            XCTAssertEqual(statuses, [200])
            try attach(statuses: statuses, original: original, refreshed: saved)
        } catch let failure as FixtureFailure {
            throw failure
        } catch {
            throw FixtureFailure.providerOrVerification
        }
    }

    private func requireFixture() throws -> NestConfiguration {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_REFRESH_FICTIONAL_MEMBER"] == "20261005" else {
                throw XCTSkip("Requires the existing fictional member and explicit live test-provider refresh.")
            }
            let configuration = try NestConfiguration.fromBundle()
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A",
                configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
                configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
                !configuration.pushEnabled
            else { throw FixtureFailure.environment }
            return configuration
        #else
            throw XCTSkip("The fictional refresh fixture is forbidden on physical devices.")
        #endif
    }

    private func read(_ storage: SecureAuthStorage, key: String) throws -> Session {
        guard let data = try storage.retrieve(key: key),
            let session = try? JSONDecoder().decode(Session.self, from: data)
        else { throw FixtureFailure.persistence }
        return session
    }

    private func promote(_ fresh: Session, replacing original: Session, storage: SecureAuthStorage, key: String) throws
    {
        let current = try read(storage, key: key)
        guard current.user.id == original.user.id, current.accessToken == original.accessToken,
            current.refreshToken == original.refreshToken
        else { throw FixtureFailure.changedSession }
        try storage.store(key: key, value: JSONEncoder().encode(fresh))
        let persisted = try read(storage, key: key)
        guard persisted.user.id == actor, persisted.accessToken == fresh.accessToken,
            persisted.refreshToken == fresh.refreshToken
        else { throw FixtureFailure.persistence }
    }

    private func verify(_ token: String, api: ChoreAPI) async throws {
        let member = try await api.verify(token: token, expectedActor: actor)
        guard member.householdId == household, member.displayName == "Test Alex" else { throw FixtureFailure.identity }
    }

    private func attach(statuses: [Int], original: Session, refreshed: Session) throws {
        let report: [String: Any] = [
            "providerStatuses": statuses, "actorId": actor.uuidString.lowercased(),
            "householdId": household.uuidString.lowercased(), "sameProviderSession": true,
            "forcedCachedLifetimeExpiry": true, "naturallyExpiredJWTVerified": false,
            "accessTokenChanged": original.accessToken != refreshed.accessToken,
            "refreshTokenChanged": original.refreshToken != refreshed.refreshToken,
            "freshKeychainReopened": true, "realMembershipVerifiedBeforeAndAfter": true,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Real fictional-member request-time refresh"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private enum FixtureFailure: Error {
        case environment, identity, persistence, changedSession, providerOrVerification
    }
}

private actor HostedRefreshTransport {
    private let origin: URL
    private let session = URLSession(configuration: .ephemeral)
    private(set) var statuses: [Int] = []

    init(origin: URL) { self.origin = origin }

    func close() { session.invalidateAndCancel() }

    func fetch(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard request.url?.scheme == origin.scheme, request.url?.host == origin.host,
            request.url?.path == "/auth/v1/token", request.url?.query == "grant_type=refresh_token",
            request.httpMethod == "POST"
        else { throw NestAPIFailure.forbidden }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw NestAPIFailure.contract }
        statuses.append(http.statusCode)
        return (data, response)
    }
}
