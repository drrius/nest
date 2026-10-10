import Auth
import CryptoKit
import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedNaturalSessionDiagnosticTests: XCTestCase {
    private let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testOneIsolatedNaturalSessionAttemptReportsProviderAndNativeVerification() async throws {
        let configuration = try requireFixture()
        let scope = try NestEnvironmentScope(url: configuration.supabaseURL)
        let main = SecureAuthStorage(service: "ch.drrius.nest.auth.\(scope.fingerprint)")
        let key = "nest.auth.\(scope.fingerprint)"
        let original = try read(main, key: key)
        guard original.user.id == actor else { throw DiagnosticFailure.identity }
        let temporary = SecureAuthStorage(service: "ch.drrius.nest.test.natural-diagnostic.\(UUID())")
        try temporary.store(key: "fixture", value: JSONEncoder().encode(original))
        addTeardownBlock {
            try temporary.remove(key: "fixture")
            XCTAssertNil(try temporary.retrieve(key: "fixture"))
        }
        let trace = NaturalSessionDiagnosticTransport(configuration: configuration)
        addTeardownBlock { await trace.close() }
        let client = AuthClient(
            url: configuration.supabaseURL.appending(path: "auth/v1"),
            headers: ["apikey": configuration.publishableKey], storageKey: "fixture", localStorage: temporary,
            fetch: { request in try await trace.provider(request) }, autoRefreshToken: false)
        let auth = NestAuth(
            client: client, storage: temporary, storageKey: "fixture", pushCleanup: nil, pushEnabled: false)
        var report: [String: Any] = [
            "diagnosticOnly": true, "expectedActor": actor.uuidString.lowercased(),
            "expectedHousehold": household.uuidString.lowercased(), "original": try metadata(original),
            "expiresAtModified": false, "originalKeychainDeletedByTest": false, "domainCommands": 0,
            "authAttemptSucceeded": false, "nativeMembershipVerified": false, "promotedAfterVerification": false,
        ]
        try await attempt(
            auth, temporary: temporary, original: original, main: main, key: key,
            configuration: configuration, trace: trace, report: &report)
        report["responses"] = try json(await trace.responses)
        report["originalAvailableAtFinish"] = try main.retrieve(key: key) != nil
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "One isolated natural Auth attempt and native session status, safe metadata only"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func attempt(
        _ auth: NestAuth, temporary: SecureAuthStorage, original: Session, main: SecureAuthStorage, key: String,
        configuration: NestConfiguration, trace: NaturalSessionDiagnosticTransport, report: inout [String: Any]
    ) async throws {
        do {
            let returned = try await auth.session()
            let fresh = try read(temporary, key: "fixture")
            guard fresh.user.id == actor, returned.userId == actor, fresh.accessToken == returned.accessToken,
                !fresh.isExpired
            else { throw DiagnosticFailure.persistence }
            guard let before = try? PushTokenIdentity(token: original.accessToken, expectedActor: actor),
                let after = try? PushTokenIdentity(token: fresh.accessToken, expectedActor: actor),
                before.session == after.session
            else { throw DiagnosticFailure.identity }
            report["authAttemptSucceeded"] = true
            report["returned"] = try metadata(fresh)
            report["sameProviderSession"] = true
            try await verifyAndPromote(
                fresh, original: original, main: main, key: key, configuration: configuration,
                trace: trace, report: &report)
        } catch let failure as NestAPIFailure {
            report["authOrVerificationFailureObserved"] = true
            report["authFailureCategory"] = String(describing: failure)
        } catch let failure as AuthError {
            report["authOrVerificationFailureObserved"] = true
            report["authFailureCategory"] = try authCategory(failure)
        }
    }

    private func verifyAndPromote(
        _ fresh: Session, original: Session, main: SecureAuthStorage, key: String,
        configuration: NestConfiguration, trace: NaturalSessionDiagnosticTransport, report: inout [String: Any]
    ) async throws {
        let http = try NestHTTP(baseURL: configuration.apiURL) { request in try await trace.domain(request) }
        do {
            let member = try await ChoreAPI(http: http).verify(token: fresh.accessToken, expectedActor: actor)
            guard member.householdId == household, member.displayName == "Test Alex" else {
                throw DiagnosticFailure.identity
            }
            report["nativeMembershipVerified"] = true
            report["promotedAfterVerification"] = try promote(fresh, replacing: original, storage: main, key: key)
        } catch let failure as NestAPIFailure {
            report["nativeMembershipVerified"] = false
            report["promotedAfterVerification"] = false
            report["domainFailureCategory"] = String(describing: failure)
        }
    }

    private func authCategory(_ failure: AuthError) throws -> String {
        switch failure {
        case .sessionMissing: return "AuthError.sessionMissing"
        case .api: return "AuthError.api"
        case .jwtVerificationFailed: return "AuthError.jwtVerificationFailed"
        default: throw DiagnosticFailure.environment
        }
    }

    private func promote(_ fresh: Session, replacing original: Session, storage: SecureAuthStorage, key: String) throws
        -> Bool
    {
        guard let data = try storage.retrieve(key: key),
            let current = try? JSONDecoder().decode(Session.self, from: data),
            current.user.id == original.user.id, current.accessToken == original.accessToken,
            current.refreshToken == original.refreshToken
        else { return false }
        if fresh.accessToken == original.accessToken && fresh.refreshToken == original.refreshToken { return false }
        try storage.store(key: key, value: JSONEncoder().encode(fresh))
        let persisted = try read(storage, key: key)
        guard persisted.user.id == actor, persisted.accessToken == fresh.accessToken,
            persisted.refreshToken == fresh.refreshToken
        else { throw DiagnosticFailure.persistence }
        return true
    }

    private func metadata(_ value: Session) throws -> [String: Any] {
        let identity = try PushTokenIdentity(token: value.accessToken, expectedActor: actor)
        let pieces = value.accessToken.split(separator: ".")
        var encoded = String(pieces[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(
            of: "_", with: "/")
        encoded += String(repeating: "=", count: (4 - encoded.count % 4) % 4)
        let data = try XCTUnwrap(Data(base64Encoded: encoded))
        let expiry = try JSONDecoder().decode(Expiry.self, from: data)
        let fingerprint = SHA256.hash(data: Data(identity.session.uuidString.lowercased().utf8))
            .map { String(format: "%02x", $0) }.joined()
        let now = Date().timeIntervalSince1970
        return [
            "cachedActor": value.user.id.uuidString.lowercased(), "cachedExpiresAt": value.expiresAt,
            "JWTExpiresAt": expiry.exp, "capturedAt": now, "cachedSessionExpired": value.isExpired,
            "JWTExpiredAtCapture": Double(expiry.exp) <= now, "sessionFingerprint": String(fingerprint.prefix(16)),
        ]
    }

    private func read(_ storage: SecureAuthStorage, key: String) throws -> Session {
        guard let data = try storage.retrieve(key: key), let value = try? JSONDecoder().decode(Session.self, from: data)
        else { throw DiagnosticFailure.persistence }
        return value
    }

    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    private func requireFixture() throws -> NestConfiguration {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_NATURAL_SESSION_DIAGNOSTIC"] == "20261006" else {
                throw XCTSkip("Requires one dated isolated natural Auth diagnostic on the existing fictional actor.")
            }
            let configuration = try NestConfiguration.fromBundle()
            guard env["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A",
                configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
                configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
                !configuration.pushEnabled
            else { throw DiagnosticFailure.environment }
            return configuration
        #else
            throw XCTSkip("Fictional Auth diagnostics are forbidden on physical devices.")
        #endif
    }

    private struct Expiry: Decodable { let exp: Int64 }
    private enum DiagnosticFailure: Error { case environment, identity, persistence }
}

private actor NaturalSessionDiagnosticTransport {
    struct Response: Codable, Sendable {
        let channel: String
        let path: String
        let status: Int
        let capturedAt: TimeInterval
        let safeErrorCode: String?
    }
    private let configuration: NestConfiguration
    private let session = URLSession(configuration: .ephemeral)
    private(set) var responses: [Response] = []
    private var providerStarted = false
    private var domainStarted = false

    init(configuration: NestConfiguration) { self.configuration = configuration }
    func close() { session.invalidateAndCancel() }

    func provider(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !providerStarted, request.url?.scheme == "https", request.url?.host == configuration.supabaseURL.host,
            request.url?.path == "/auth/v1/token", request.url?.query == "grant_type=refresh_token",
            request.httpMethod == "POST"
        else { throw NestAPIFailure.forbidden }
        providerStarted = true
        return try await fetch(request, channel: "provider")
    }

    func domain(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !domainStarted, request.url?.scheme == "https", request.url?.host == configuration.apiURL.host,
            request.url?.path == "/v1/session", request.url?.query == nil, request.httpMethod == "GET"
        else { throw NestAPIFailure.forbidden }
        domainStarted = true
        return try await fetch(request, channel: "domain")
    }

    private func fetch(_ request: URLRequest, channel: String) async throws -> (Data, URLResponse) {
        let (data, response) = try await session.data(for: request, delegate: NoRedirects())
        guard let http = response as? HTTPURLResponse else { throw NestAPIFailure.contract }
        responses.append(
            .init(
                channel: channel, path: request.url!.path, status: http.statusCode,
                capturedAt: Date().timeIntervalSince1970, safeErrorCode: errorCode(data, status: http.statusCode)))
        return (data, response)
    }

    private func errorCode(_ data: Data, status: Int) -> String? {
        guard status != 200, data.count <= 16_384,
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        let nested = object["error"] as? [String: Any]
        guard let code = (nested?["code"] ?? object["error_code"]) as? String,
            code.range(of: #"\A[A-Za-z][A-Za-z0-9_]{0,63}\z"#, options: .regularExpression) != nil
        else { return nil }
        return code
    }
}
