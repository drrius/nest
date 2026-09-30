import CryptoKit
import Foundation
import XCTest

@testable import NestCore

final class HostedSetupReadTests: XCTestCase {
    func testOwnedFactsMatchRealPreferencesAndOutsiderCannotRead() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            actor == UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200"),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Exact isolated fictional read credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: url)!)
        let member = try await ChoreAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test "),
            member.householdId == UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")
        else {
            throw NestAPIFailure.forbidden
        }
        let api = SetupAPI(http: http)
        let before = try await api.read(token: token, member: member)
        let food = try await FoodAPI(http: http).read(token: token, member: member)
        let cooking = try await MealAPI(http: http).cookingProfile(token: token, member: member)
        let notifications = try await NotificationAPI(http: http).read(token: token, member: member)
        try checkFixtureSnapshot(food: food, cooking: cooking, notifications: notifications, env: env)
        XCTAssertEqual(before.foodConfigured, food.profile != nil)
        XCTAssertEqual(before.cookingConfigured, cooking.profile != nil)
        XCTAssertEqual(before.notificationsConfigured, notifications.profile != nil)
        let after = try await api.read(token: token, member: member)
        XCTAssertEqual(after, before, "Read-only setup must not invent or save choices")
        do {
            _ = try await api.read(token: outsider, member: member)
            XCTFail("Outsider read another member's setup")
        } catch { XCTAssertTrue(error as? NestAPIFailure == .forbidden || error as? NestAPIFailure == .notMember) }
    }

    private func checkFixtureSnapshot(
        food: FoodProfileEnvelope, cooking: CookingSlotsEnvelope, notifications: NotificationProfileEnvelope,
        env: [String: String]
    ) throws {
        guard let path = env["NEST_TEST_SETUP_BASELINE_FILE"] else { return }
        guard path.hasPrefix("/private/tmp/nest-setup-"), path.hasSuffix(".sha256"), !path.contains("..") else {
            throw NestAPIFailure.configuration
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let encoded = try encoder.encode([encoder.encode(food), encoder.encode(cooking), encoder.encode(notifications)])
        let digest = SHA256.hash(data: encoded).map { String(format: "%02x", $0) }.joined()
        if env["NEST_TEST_SETUP_CAPTURE"] == "true" {
            guard !FileManager.default.fileExists(atPath: path) else { throw NestAPIFailure.configuration }
            try Data(digest.utf8).write(to: URL(fileURLWithPath: path), options: .atomic)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: path)
        } else {
            let original = try String(contentsOfFile: path, encoding: .utf8)
            XCTAssertEqual(
                digest, original,
                "Native setup navigation/skipping must leave all three profiles and revisions unchanged")
        }
    }
}
