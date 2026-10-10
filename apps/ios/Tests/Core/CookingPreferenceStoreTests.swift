import Foundation
import XCTest

@testable import NestCore

final class CookingPreferenceStoreTests: XCTestCase {
    func testUnknownSaveSurvivesReopenAndWaitsForExactObservedPreferences() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "cooking-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let baseline = CookingSlotsEnvelope(version: 1, householdId: member.householdId, profile: nil)
        try await store.saveCookingProfile(baseline, lease: lease)
        let command = try SaveCookingProfile(
            operationId: UUID(), expectedRevision: "0", notes: "Quick dinners", slots: [.dinner])
        let saved = SavedCookingPreference(baseline: baseline, command: command, state: .pending, receipt: nil)
        try await store.enqueueCookingPreference(saved, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let foreign = try await reopened.activate(
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readCookingPreference(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let pending = try await reopened.readCookingPreference(lease: restored)
        XCTAssertEqual(pending, saved)
        do {
            try await reopened.discardConflictedCookingPreference(lease: restored)
            XCTFail("Discarded uncertain save")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let receipt = CookingSaveReceipt(
            actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, revision: "1")
        try await reopened.acknowledgeCookingPreference(receipt, lease: restored)
        let wrong = CookingSlotsEnvelope(
            version: 1, householdId: member.householdId,
            profile: .init(revision: "1", preferences: .init(cookingNotes: "Different", mealSlots: [.lunch])))
        try await reopened.saveCookingProfile(wrong, lease: restored)
        let waiting = try await reopened.readCookingPreference(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        let confirmed = CookingSlotsEnvelope(
            version: 1, householdId: member.householdId,
            profile: .init(revision: "1", preferences: command.preferences))
        try await reopened.saveCookingProfile(confirmed, lease: restored)
        let cleared = try await reopened.readCookingPreference(lease: restored)
        XCTAssertNil(cleared)
        try await reopened.saveCookingProfile(baseline, lease: restored)
        let retained = try await reopened.readCookingProfile(lease: restored)
        XCTAssertEqual(retained, confirmed)
    }
}
