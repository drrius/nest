import Foundation
import XCTest

@testable import NestCore

final class HostedFoodPreferencesTests: XCTestCase {
    func testPrivateSaveReplayDenialAndRestoration() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: url)!)
        let membership = MealAPI(http: http)
        let api = FoodAPI(http: http)
        let member = try await membership.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let baseline = try await api.read(token: token, member: member)
        guard let original = baseline.profile else {
            throw XCTSkip("Existing fictional food profile required for restoration")
        }
        let preferences = FoodPreferences(
            restrictions: ["Synthetic vegetarian preference"], dislikes: [], calorieGoal: nil, portions: 1.5)
        let command = SaveFoodPreferences(
            operationId: UUID(), expectedRevision: original.revision, preferences: preferences)
        do {
            _ = try await api.read(token: outsider, member: member)
            XCTFail("Outsider read private food preferences")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.save(token: outsider, member: member, command: command)
            XCTFail("Outsider saved private preferences")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            let receipt = try await api.save(token: token, member: member, command: command)
            let replay = try await api.save(token: token, member: member, command: command)
            XCTAssertEqual(receipt, replay)
            let fresh = try await api.read(token: token, member: member)
            XCTAssertEqual(fresh.profile?.preferences, preferences)
            XCTAssertEqual(fresh.profile?.revision, receipt.revision)
            let stale = SaveFoodPreferences(
                operationId: UUID(), expectedRevision: original.revision, preferences: preferences)
            do {
                _ = try await api.save(token: token, member: member, command: stale)
                XCTFail("Accepted stale profile revision")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        } catch {
            try await restore(original.preferences, api: api, token: token, member: member)
            throw error
        }
        try await restore(original.preferences, api: api, token: token, member: member)
    }

    private func restore(_ preferences: FoodPreferences, api: FoodAPI, token: String, member: VerifiedMember)
        async throws
    {
        let current = try await api.read(token: token, member: member)
        guard let profile = current.profile else { throw FoodPreferenceError.invalidResponse }
        _ = try await api.save(
            token: token, member: member,
            command: SaveFoodPreferences(
                operationId: UUID(), expectedRevision: profile.revision, preferences: preferences))
        let restored = try await api.read(token: token, member: member)
        XCTAssertEqual(restored.profile?.preferences, preferences)
    }
}
