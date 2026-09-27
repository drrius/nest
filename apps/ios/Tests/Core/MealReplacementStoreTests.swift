import Foundation
import XCTest

@testable import NestCore

final class MealReplacementStoreTests: XCTestCase {
    func testRestartIsolationAndConfirmedReplacement() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "replace-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let start = try MealWeekStart("2026-09-28")
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "1", entries: [meal])
        let command = try ReplaceMeal(week: week, meal: meal, operationId: UUID(), title: "Soup")
        let saved = SavedMealReplacement(week: week, meal: meal, command: command, state: .pending, receipt: nil)
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealReplacement(saved, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let foreign = try await reopened.activate(
            VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Other"))
        let hidden = try await reopened.readMealReplacement(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let pending = try await reopened.readMealReplacement(lease: restored)
        XCTAssertEqual(pending, saved)
        do {
            try await reopened.discardConflictedMealReplacement(lease: restored)
            XCTFail("Discarded an uncertain replacement")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let receipt = MealReplacementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, previousEntryId: meal.id, entryId: UUID(), weekStart: start,
            date: meal.date, slot: meal.slot, revision: "3", skippedPreparationId: nil)
        try await reopened.acknowledgeMealReplacement(receipt, lease: restored)
        let missing = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "3", entries: [])
        try await reopened.saveMealWeek(missing, lease: restored)
        let waiting = try await reopened.readMealReplacement(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        let newMeal = PlannedMeal(
            entryId: receipt.entryId, date: meal.date, slot: meal.slot,
            title: command.title, recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let confirmed = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "3", entries: [newMeal])
        try await reopened.saveMealWeek(confirmed, lease: restored)
        let cleared = try await reopened.readMealReplacement(lease: restored)
        XCTAssertNil(cleared)
    }
}
