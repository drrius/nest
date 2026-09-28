import Foundation
import XCTest

@testable import NestCore

final class HostedCookingPreferencesTests: XCTestCase {
    func testSaveReplayDenialAndRestore() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let api = MealAPI(http: try NestHTTP(baseURL: URL(string: url)!))
        let member = try await api.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let before = try await api.cookingProfile(token: token, member: member)
        guard let original = before.profile else {
            throw XCTSkip("Requires an existing fictional cooking profile to restore")
        }
        let command = try SaveCookingProfile(
            operationId: UUID(), expectedRevision: original.revision,
            notes: "Synthetic preference check \(UUID())", slots: [.dinner])
        do {
            _ = try await api.saveCookingProfile(token: outsider, member: member, command: command)
            XCTFail("Outsider changed household preferences")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            let receipt = try await api.saveCookingProfile(token: token, member: member, command: command)
            let replay = try await api.saveCookingProfile(token: token, member: member, command: command)
            XCTAssertEqual(receipt, replay)
            let observed = try await api.cookingProfile(token: token, member: member)
            XCTAssertEqual(observed.profile?.preferences, command.preferences)
            XCTAssertEqual(observed.profile?.revision, receipt.revision)
            let stale = try SaveCookingProfile(
                operationId: UUID(), expectedRevision: original.revision,
                notes: "Stale writer", slots: [.lunch])
            do {
                _ = try await api.saveCookingProfile(token: token, member: member, command: stale)
                XCTFail("Stale preferences overwrote a newer save")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        } catch {
            try await restore(original, command: command, api: api, token: token, member: member)
            throw error
        }
        try await restore(original, command: command, api: api, token: token, member: member)
    }

    private func restore(
        _ original: CookingSlotsEnvelope.Profile, command: SaveCookingProfile,
        api: MealAPI, token: String, member: VerifiedMember
    ) async throws {
        let current = try await api.cookingProfile(token: token, member: member)
        let profile = try XCTUnwrap(current.profile)
        if profile.preferences == original.preferences { return }
        guard profile.preferences == command.preferences,
            profile.revision == String(Int64(command.expectedRevision)! + 1)
        else { throw NestAPIFailure.conflict }
        let restore = try SaveCookingProfile(
            operationId: UUID(), expectedRevision: profile.revision,
            notes: original.preferences.cookingNotes, slots: original.preferences.mealSlots)
        _ = try await api.saveCookingProfile(token: token, member: member, command: restore)
        let after = try await api.cookingProfile(token: token, member: member)
        XCTAssertEqual(after.profile?.preferences, original.preferences)
    }
}
