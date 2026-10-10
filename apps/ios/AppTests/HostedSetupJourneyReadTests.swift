import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedSetupJourneyReadTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedSetupStatusReadOnly() async throws {
        let (actor, name) = try requireFixture()
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw NestAPIFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("setup-read.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: store)
        let credentials = try await auth.session()
        guard credentials.userId == actor else { throw NestAPIFailure.signedOut }
        let trace = SetupJourneyReadTrace()
        let http = try NestHTTP(baseURL: configuration.apiURL) { request in
            guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app"
            else { throw NestAPIFailure.configuration }
            let (data, response) = try await URLSession.shared.data(for: request, delegate: NoRedirects())
            if let response = response as? HTTPURLResponse {
                await trace.record(path: request.url?.path ?? "", status: response.statusCode)
            }
            return (data, response)
        }
        do {
            let member = try await MealAPI(http: http).verify(
                token: credentials.accessToken, expectedActor: actor)
            XCTAssertEqual(member.displayName, name)
            XCTAssertEqual(member.householdId.uuidString.lowercased(), "be772ffd-3ab5-41d5-8438-647a79a553da")
            let status = try await SetupAPI(http: http).read(token: credentials.accessToken, member: member)
            XCTAssertEqual(status.foodConfigured, name == "Test Alex")
            XCTAssertTrue(status.cookingConfigured)
            XCTAssertEqual(status.notificationsConfigured, name == "Test Alex")
            try attach(status, name: "Owned native setup status canonical read")
            try await attach(trace.requests, name: "Safe setup GET status trace")
        } catch {
            try await attach(trace.requests, name: "Safe setup GET status trace")
            throw error
        }
    }

    private func requireFixture() throws -> (UUID, String) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SETUP_READ"] == "20261007-read-only-pair" else {
            throw XCTSkip("Explicit fictional setup read; no Save or permission grant permitted")
        }
        let roles = [
            "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": ("791f7261-6c9d-4061-9c8a-57aa6e0b0200", "Test Alex"),
            "CA0BCEDE-A297-493A-8921-9E31F8B65783": ("e5f80cfd-b69a-4aa0-a267-75784e943676", "Test Sam"),
        ]
        let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
        XCTAssertEqual(env["NEST_QA_NAME"], role.1)
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        return (try XCTUnwrap(UUID(uuidString: role.0)), role.1)
    }

    private func attach<Value: Encodable>(_ value: Value, name: String) throws {
        let attachment = XCTAttachment(data: try JSONEncoder().encode(value), uniformTypeIdentifier: "public.json")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private actor SetupJourneyReadTrace {
    struct Request: Encodable {
        let path: String
        let status: Int
    }
    var requests: [Request] = []
    func record(path: String, status: Int) { requests.append(.init(path: path, status: status)) }
}
