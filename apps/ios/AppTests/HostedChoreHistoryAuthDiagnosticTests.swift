import Auth
import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedChoreHistoryAuthDiagnosticTests: XCTestCase {
    private let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testExistingOwnerSessionAndTracedMembershipReadOnly() async throws {
        try authorized()
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw DiagnosticFailure.environment }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("auth-diagnostic.sqlite"))
        let auth = try NestAuth(configuration: config, offline: offline)
        let trace = ChoreHistoryAuthTrace()
        var category: String?
        do {
            await trace.stage("shipping_auth_session")
            let credentials = try await auth.session()
            let matches = credentials.userId == actor
            await trace.sessionActor(matches)
            guard matches else { throw DiagnosticFailure.identity }
            await trace.stage("membership_get")
            category = try await recordMembership(config, token: credentials.accessToken, trace: trace)
        } catch let failure as AuthError {
            category = authCategory(failure)
            await trace.error(authCategory(failure))
            if failure == .sessionMissing { await trace.missingCachedAuth() }
        } catch let failure as DiagnosticFailure {
            await trace.error("diagnostic." + String(describing: failure))
            try await attach(trace)
            throw failure
        } catch {
            await trace.error("unexpected")
            try await attach(trace)
            throw DiagnosticFailure.response
        }
        await trace.complete()
        try await attach(trace)
        let record = await trace.snapshot()
        XCTAssertFalse(record.boundaryViolation)
        if category == nil { XCTAssertTrue(record.nativeMembershipVerified) }
    }

    private func recordMembership(
        _ config: NestConfiguration, token: String, trace: ChoreHistoryAuthTrace
    ) async throws -> String? {
        do {
            let member = try await membership(config, token: token, trace: trace)
            let valid = member.userId == actor && member.householdId == household && member.displayName == "Test Alex"
            await trace.membership(valid)
            guard valid else { throw DiagnosticFailure.identity }
            return nil
        } catch let failure as NestAPIFailure {
            let category = "native." + String(describing: failure)
            await trace.error(category)
            if failure == .signedOut, await trace.membershipStatus() == 401 {
                await trace.stage("same_token_supabase_user_get")
                try await providerUser(config, token: token, trace: trace)
            }
            return category
        }
    }

    private func membership(
        _ config: NestConfiguration, token: String, trace: ChoreHistoryAuthTrace
    ) async throws -> VerifiedMember {
        let http = try NestHTTP(baseURL: config.apiURL) { request in
            guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app",
                request.url?.path == "/v1/session"
            else {
                await trace.invalidBoundary()
                throw DiagnosticFailure.environment
            }
            let (data, response) = try await URLSession.shared.data(for: request, delegate: NoRedirects())
            if let response = response as? HTTPURLResponse {
                await trace.response(path: "/v1/session", status: response.statusCode, media: response.mimeType)
            }
            return (data, response)
        }
        return try await ChoreAPI(http: http).verify(token: token, expectedActor: actor)
    }

    private func providerUser(
        _ config: NestConfiguration, token: String, trace: ChoreHistoryAuthTrace
    ) async throws {
        guard await trace.membershipStatus() == 401 else { throw DiagnosticFailure.environment }
        var request = URLRequest(url: config.supabaseURL.appending(path: "auth/v1/user"))
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(config.publishableKey, forHTTPHeaderField: "apikey")
        let (data, response) = try await URLSession.shared.data(for: request, delegate: NoRedirects())
        guard let response = response as? HTTPURLResponse else { throw DiagnosticFailure.response }
        await trace.response(path: "/auth/v1/user", status: response.statusCode, media: response.mimeType)
        if response.statusCode == 200 {
            guard let user = try? JSONDecoder().decode(UserIdentity.self, from: data) else {
                throw DiagnosticFailure.response
            }
            let matches = user.id == actor
            await trace.providerActor(matches)
            guard matches else { throw DiagnosticFailure.identity }
        }
    }

    private func authorized() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_CHORE_HISTORY_AUTH_DIAGNOSTIC"] == "20261006-one-owner-boundary" else {
            throw XCTSkip("Dated fictional owner auth/session GET diagnostic; no domain action")
        }
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_NAME"], "Test Alex")
        XCTAssertEqual(env["NEST_QA_ACTOR"], actor.uuidString.lowercased())
        XCTAssertEqual(env["NEST_QA_HOUSEHOLD"], household.uuidString.lowercased())
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
    }

    private func authCategory(_ error: AuthError) -> String {
        switch error {
        case .sessionMissing: "auth.sessionMissing"
        case .api: "auth.api"
        case .missingExpClaim: "auth.missingExpClaim"
        case .malformedJWT: "auth.malformedJWT"
        default: "auth.other"
        }
    }

    private func attach(_ trace: ChoreHistoryAuthTrace) async throws {
        let record = await trace.snapshot()
        let attachment = XCTAttachment(data: try JSONEncoder().encode(record), uniformTypeIdentifier: "public.json")
        attachment.name = "Existing fictional owner auth and membership boundary observation"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private struct UserIdentity: Decodable { let id: UUID }
private enum DiagnosticFailure: Error { case environment, identity, response }

private struct ChoreHistoryAuthObservation: Encodable, Sendable {
    struct Request: Encodable, Sendable {
        let method: String
        let path: String
        let status: Int
        let contentMediaType: String
        let elapsedSeconds: Double
    }
    var stage = "not_started"
    var diagnosticFinished = false
    var sessionExpectedActorMatches: Bool?
    var nativeMembershipVerified = false
    var providerExpectedActorMatches: Bool?
    var cachedAuthUnavailable = false
    var boundaryViolation = false
    var errorCategory: String?
    var requests: [Request] = []
    var elapsedSeconds = 0.0
    let domainMutationBudget = 0
    let shippingSessionMayNaturallyRefresh = true
    let old9410CauseEstablishedByThisDiagnostic = false
    let tokenHeadersProviderBodiesOrCredentialsExported = false
}

private actor ChoreHistoryAuthTrace {
    private let started = ProcessInfo.processInfo.systemUptime
    private var record = ChoreHistoryAuthObservation()

    func stage(_ value: String) { record.stage = value }
    func complete() { record.diagnosticFinished = true }
    func sessionActor(_ matches: Bool) { record.sessionExpectedActorMatches = matches }
    func membership(_ verified: Bool) { record.nativeMembershipVerified = verified }
    func providerActor(_ matches: Bool) { record.providerExpectedActorMatches = matches }
    func error(_ category: String) { record.errorCategory = category }
    func missingCachedAuth() { record.cachedAuthUnavailable = true }
    func invalidBoundary() { record.boundaryViolation = true }

    func response(path: String, status: Int, media: String?) {
        let type = media?.lowercased()
        let classification =
            type == "application/json" || type == "text/html" ? type! : (type == nil ? "absent" : "other")
        record.requests.append(
            .init(
                method: "GET", path: path, status: status, contentMediaType: classification,
                elapsedSeconds: ProcessInfo.processInfo.systemUptime - started))
    }

    func membershipStatus() -> Int? { record.requests.first { $0.path == "/v1/session" }?.status }

    func snapshot() -> ChoreHistoryAuthObservation {
        var result = record
        result.elapsedSeconds = ProcessInfo.processInfo.systemUptime - started
        return result
    }
}
