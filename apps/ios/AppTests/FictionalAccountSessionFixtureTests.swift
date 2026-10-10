import Auth
import Foundation
import XCTest

@testable import Nest

/// Operator fixture login, never a shipping password-sign-in feature or Apple-auth evidence.
/// Installs a synthetic `example.invalid` member's session in this simulator's Keychain so the
/// app opens signed in. Agent verification runs drive it through `nest-verify signin`.
@MainActor
final class FictionalAccountSessionFixtureTests: XCTestCase {
    func testInstallFictionalPartnerSession() async throws {
        try await install(role: "partner")
    }

    func testInstallFictionalMemberSession() async throws {
        try await install(role: "member")
    }

    private func install(role: String) async throws {
        let configuration = try requireFixture(role)
        let path = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_TEST_FICTIONAL_LOGIN_FILE"])
        let accounts = try JSONDecoder().decode(
            [String: Credentials].self, from: Data(contentsOf: URL(filePath: path)))
        let credential = try XCTUnwrap(accounts[role])
        guard accounts.values.allSatisfy({ $0.email.hasSuffix("@example.invalid") }),
            Set(accounts.values.map(\.householdId)) == [credential.householdId],
            !credential.password.isEmpty
        else { throw FixtureFailure.identity }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("fixture.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: offline)
        let fixtureActors = Set(accounts.values.map(\.actorId))
        if let previous = await auth.cachedSession(), !fixtureActors.contains(previous.userId) {
            throw FixtureFailure.nonFixtureSession
        }
        do {
            let result = try await auth.client.signIn(email: credential.email, password: credential.password)
            guard result.user.id == credential.actorId else { throw FixtureFailure.identity }
            try requireSavedSession(result, configuration: configuration, stage: .persistenceAfterSignIn)
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let member = try await MealAPI(http: http).verify(
                token: result.accessToken, expectedActor: credential.actorId)
            guard member.householdId == credential.householdId, member.displayName == credential.name else {
                throw FixtureFailure.identity
            }
            try requireSavedSession(result, configuration: configuration, stage: .persistenceAfterVerification)
            let restored = try NestAuth(configuration: configuration, offline: offline)
            let recovered = try await restored.session()
            XCTAssertEqual(recovered.userId, credential.actorId)
            XCTAssertTrue(recovered.accessToken == result.accessToken, "Reopening must retain the verified session.")
        } catch let failure as FixtureFailure {
            throw failure
        } catch {
            throw FixtureFailure.signInOrPersistence
        }
    }

    private func requireSavedSession(
        _ session: Session, configuration: NestConfiguration, stage: FixtureFailure
    ) throws {
        let scope = try NestEnvironmentScope(url: configuration.supabaseURL)
        let storage = SecureAuthStorage(service: "ch.drrius.nest.auth.\(scope.fingerprint)")
        guard let data = try storage.retrieve(key: "nest.auth.\(scope.fingerprint)"),
            let saved = try? JSONDecoder().decode(Session.self, from: data),
            saved.user.id == session.user.id, saved.accessToken == session.accessToken
        else { throw stage }
    }

    /// Runs only on the one simulator the operator names, against the hosted test origins.
    private func requireFixture(_ role: String) throws -> NestConfiguration {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_TEST_FICTIONAL_ACCOUNT"] == role else {
                throw XCTSkip("Requires explicit fictional-account fixture setup.")
            }
            let configuration = try NestConfiguration.fromBundle()
            guard let simulator = environment["SIMULATOR_UDID"],
                simulator == environment["NEST_TEST_FICTIONAL_SIMULATOR"],
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
        let name: String
    }

    private enum FixtureFailure: Error {
        case environment, identity, nonFixtureSession, signInOrPersistence
        case persistenceAfterSignIn, persistenceAfterVerification
    }
}
