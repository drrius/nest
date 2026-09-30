import Auth
import Foundation
import XCTest

@testable import Nest

/// Operator fixture login, never a shipping password-sign-in feature or Apple-auth evidence.
@MainActor
final class FictionalAccountSessionFixtureTests: XCTestCase {
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let partner = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!

    func testInstallFictionalPartnerSession() async throws {
        try await install(role: "partner", expectedActor: partner, name: "Test Sam")
    }

    func testRestoreFictionalMemberSession() async throws {
        try await install(role: "member", expectedActor: actor, name: "Test Alex")
    }

    private func install(role: String, expectedActor: UUID, name: String) async throws {
        let configuration = try requireFixture(role)
        let path = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_TEST_FICTIONAL_LOGIN_FILE"])
        let credentials = try JSONDecoder().decode(
            [String: Credentials].self, from: Data(contentsOf: URL(filePath: path)))
        let credential = try XCTUnwrap(credentials[role])
        guard credential.actorId == expectedActor, credential.householdId == household,
            !credential.email.isEmpty, !credential.password.isEmpty
        else { throw FixtureFailure.identity }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("fixture.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: offline)
        if let previous = await auth.cachedSession(), previous.userId != actor && previous.userId != partner {
            throw FixtureFailure.nonFixtureSession
        }
        do {
            let result = try await auth.client.signIn(email: credential.email, password: credential.password)
            guard result.user.id == expectedActor else { throw FixtureFailure.identity }
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let member = try await MealAPI(http: http).verify(token: result.accessToken, expectedActor: expectedActor)
            guard member.householdId == household, member.displayName == name else { throw FixtureFailure.identity }
            let restored = try NestAuth(configuration: configuration, offline: offline)
            let recovered = try await restored.session()
            XCTAssertEqual(recovered.userId, expectedActor)
            XCTAssertEqual(recovered.accessToken, result.accessToken)
        } catch {
            throw FixtureFailure.signInOrPersistence
        }
    }

    private func requireFixture(_ role: String) throws -> NestConfiguration {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_FICTIONAL_ACCOUNT"] == role else {
                throw XCTSkip("Requires explicit fictional-account fixture setup.")
            }
            let configuration = try NestConfiguration.fromBundle()
            let ownedSimulators = [
                "EE945B62-C56C-4AB9-A09E-C4B44F9CF03C",
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A",
            ]
            guard let simulator = environment["SIMULATOR_UDID"], ownedSimulators.contains(simulator),
                configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
                configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
                !configuration.pushEnabled
            else { throw FixtureFailure.environment }
            return configuration
        #else
            throw XCTSkip("Fictional fixture login is forbidden on physical devices.")
        #endif
    }

    private struct Credentials: Decodable {
        let actorId: UUID
        let householdId: UUID
        let email: String
        let password: String
    }

    private enum FixtureFailure: Error {
        case environment, identity, nonFixtureSession, signInOrPersistence
    }
}
