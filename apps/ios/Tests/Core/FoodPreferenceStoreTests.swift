import Foundation
import XCTest

@testable import NestCore

final class FoodPreferenceStoreTests: XCTestCase {
    func testPrivateRestartAndExactAcknowledgementReconciliation() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "food-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let baseline = FoodProfileEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, profile: nil)
        try await store.saveFoodProfile(baseline, lease: lease)
        let preferences = FoodPreferences(restrictions: ["Vegetarian"], dislikes: [], calorieGoal: nil, portions: 1.5)
        let command = SaveFoodPreferences(operationId: UUID(), expectedRevision: "0", preferences: preferences)
        try await store.enqueueFoodPreference(
            .init(baseline: baseline, command: command, state: .pending, receipt: nil), lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let partner = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Partner"))
        let hiddenProfile = try await reopened.readFoodProfile(lease: partner)
        let hiddenCommand = try await reopened.readFoodPreference(lease: partner)
        XCTAssertNil(hiddenProfile)
        XCTAssertNil(hiddenCommand)
        do {
            try await reopened.saveFoodProfile(baseline, lease: partner)
            XCTFail("Cached another actor's private profile")
        } catch {}
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readFoodPreference(lease: restored)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.discardConflictedFoodPreference(lease: restored)
            XCTFail("Discarded uncertain save")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let receipt = FoodPreferenceReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId, revision: "1")
        try await reopened.acknowledgeFoodPreference(receipt, lease: restored)
        var different = preferences
        different.portions = 2
        try await reopened.saveFoodProfile(
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                profile: .init(revision: "1", preferences: different)), lease: restored)
        let waiting = try await reopened.readFoodPreference(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        let current = FoodProfileEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            profile: .init(revision: "1", preferences: preferences))
        try await reopened.saveFoodProfile(current, lease: restored)
        let finished = try await reopened.readFoodPreference(lease: restored)
        XCTAssertNil(finished)
        try await reopened.saveFoodProfile(baseline, lease: restored)
        let retained = try await reopened.readFoodProfile(lease: restored)
        XCTAssertEqual(retained, current)
    }
}
