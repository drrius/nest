import Foundation
import XCTest

@testable import NestCore

final class HostedPushRegistrationTests: XCTestCase {
    func testFictionalRegistrationReplayCancellationAndDisable() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_APNS_REGISTRATION"] == "1",
            env["NEST_TEST_ACTOR_ID"] == "791f7261-6c9d-4061-9c8a-57aa6e0b0200",
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional APNs registration credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await ChoreAPI(http: http).verify(
            token: token, expectedActor: UUID(uuidString: env["NEST_TEST_ACTOR_ID"]!)!)
        guard member.displayName == "Test Alex",
            member.householdId == UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")
        else { throw NestAPIFailure.forbidden }
        let api = NotificationAPI(http: http)
        let installation = UUID()
        // Synthetic bytes: only hosted authorization/registration is exercised.
        // No Apple token, native permission or provider delivery is asserted.
        let command = PushDeviceCommand(
            operationId: UUID(), installationId: installation, expectedRevision: nil, action: .register,
            token: UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased(), environment: .sandbox)
        let baseline = try await api.pushDevice(token: token, member: member, installation: installation)
        XCTAssertFalse(baseline.enabled)
        XCTAssertNil(baseline.revision)
        do {
            try await verify(api: api, token: token, outsider: outsider, member: member, command: command)
        } catch {
            try await disable(api: api, token: token, member: member, installation: installation)
            throw error
        }
        try await disable(api: api, token: token, member: member, installation: installation)
        let historical = try await api.recoverPushDevice(token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(historical.status, .recorded)
        let ended = try await api.pushDevice(token: token, member: member, installation: installation)
        XCTAssertFalse(ended.enabled)
    }

    private func verify(
        api: NotificationAPI, token: String, outsider: String, member: VerifiedMember, command: PushDeviceCommand
    ) async throws {
        do {
            _ = try await api.savePushDevice(token: outsider, member: member, command: command)
            XCTFail("Outsider registered another household's device")
        } catch { XCTAssertTrue(error as? NestAPIFailure == .forbidden || error as? NestAPIFailure == .notMember) }
        let receipt = try await api.savePushDevice(token: token, member: member, command: command)
        let replay = try await api.savePushDevice(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let recovered = try await api.recoverPushDevice(token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.receipt, receipt)
        let current = try await api.pushDevice(token: token, member: member, installation: command.installationId)
        XCTAssertTrue(current.enabled)
        XCTAssertEqual(current.provider, "apns")
        XCTAssertEqual(current.environment, .sandbox)
        XCTAssertEqual(current.revision, receipt.revision)
        let stale = PushDeviceCommand(
            operationId: UUID(), installationId: command.installationId, expectedRevision: nil,
            action: .register, token: command.token, environment: .sandbox)
        do {
            _ = try await api.savePushDevice(token: token, member: member, command: stale)
            XCTFail("Stale revision replaced registration")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancelled = try await api.recoverPushDevice(token: token, member: member, command: stale, cancel: true)
        XCTAssertEqual(cancelled.status, .cancelled)
        do {
            _ = try await api.savePushDevice(token: token, member: member, command: stale)
            XCTFail("Cancelled registration executed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let unchanged = try await api.pushDevice(token: token, member: member, installation: command.installationId)
        XCTAssertEqual(unchanged, current)
    }

    private func disable(api: NotificationAPI, token: String, member: VerifiedMember, installation: UUID) async throws {
        let current = try await api.pushDevice(token: token, member: member, installation: installation)
        guard current.enabled else { return }
        let command = PushDeviceCommand(
            operationId: UUID(), installationId: installation, expectedRevision: current.revision, action: .disable)
        let receipt = try await api.savePushDevice(token: token, member: member, command: command)
        let replay = try await api.savePushDevice(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        XCTAssertEqual(replay.action, .disable)
        let ended = try await api.pushDevice(token: token, member: member, installation: installation)
        XCTAssertFalse(ended.enabled)
    }
}
