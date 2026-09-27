import Foundation
import XCTest

@testable import NestCore

final class MealMoveStoreTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")

    func testCrossWeekReceiptWaitsForBothSnapshots() async throws {
        let (store, lease, saved) = try await fixture()
        try await store.acknowledgeMealMove(receipt(saved), lease: lease)
        let moved = PlannedMeal(
            entryId: saved.meal.id, date: saved.command.date, slot: .lunch,
            title: saved.meal.title, recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        try await store.saveMealWeek(updated(saved.target, entries: [moved]), lease: lease)
        let waiting = try await store.readMealMove(lease: lease)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await store.saveMealWeek(updated(saved.source, entries: []), lease: lease)
        let finished = try await store.readMealMove(lease: lease)
        XCTAssertNil(finished)
    }

    func testWrongReceiptAndPendingDiscardCannotLoseOperation() async throws {
        let (store, lease, saved) = try await fixture()
        let wrong = MealMoveReceipt(
            version: 1, actorId: UUID(), householdId: member.householdId,
            operationId: saved.command.operationId, entryId: saved.meal.id,
            sourceWeekStart: saved.source.weekStart, targetWeekStart: saved.target.weekStart,
            sourceRevision: "2", targetRevision: "2", date: saved.command.date, slot: .lunch)
        do {
            try await store.acknowledgeMealMove(wrong, lease: lease)
            XCTFail("Accepted another actor's receipt")
        } catch {}
        do {
            try await store.discardConflictedMealMove(lease: lease)
            XCTFail("Discarded an uncertain write")
        } catch {}
        let pending = try await store.readMealMove(lease: lease)
        XCTAssertEqual(pending, saved)
        try await store.conflictMealMove(saved.command.operationId, lease: lease)
        try await store.discardConflictedMealMove(lease: lease)
        let discarded = try await store.readMealMove(lease: lease)
        XCTAssertNil(discarded)
    }

    func testPendingMoveBlocksCompetingRemovalAndIsolatesAccounts() async throws {
        let (store, lease, saved) = try await fixture()
        let removal = try RemoveMeal(week: saved.source, meal: saved.meal, operationId: UUID())
        do {
            try await store.enqueueMealRemoval(saved.source, meal: saved.meal, command: removal, lease: lease)
            XCTFail("Allowed competing write")
        } catch { XCTAssertEqual(error as? OfflineFailure, .missingSnapshot) }
        let foreign = try await store.activate(VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam"))
        let hidden = try await store.readMealMove(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await store.activate(member)
        let pending = try await store.readMealMove(lease: restored)
        XCTAssertEqual(pending?.command.operationId, saved.command.operationId)
    }

    func testNoOpAndOccupiedDestinationRejected() async throws {
        let (_, _, saved) = try await fixture()
        XCTAssertThrowsError(
            try MoveMeal(
                source: saved.source, target: saved.source, meal: saved.meal,
                operationId: UUID(), date: saved.meal.date, slot: saved.meal.slot))
        let occupied = PlannedMeal(
            entryId: UUID(), date: saved.command.date, slot: .lunch,
            title: "Soup", recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        XCTAssertThrowsError(
            try MoveMeal(
                source: saved.source,
                target: updated(saved.target, entries: [occupied]), meal: saved.meal,
                operationId: UUID(), date: saved.command.date, slot: .lunch))
    }

    private func fixture() async throws -> (ChoreOfflineStore, OfflineLease, SavedMealMove) {
        let url = FileManager.default.temporaryDirectory.appending(path: "move-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let start = try MealWeekStart("2026-09-28")
        let next = try start.adjacent(1)
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let source = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "1", entries: [meal])
        let target = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: next, revision: "1", entries: [])
        let command = try MoveMeal(
            source: source, target: target, meal: meal,
            operationId: UUID(), date: next.date, slot: .lunch)
        let saved = SavedMealMove(
            source: source, target: target, meal: meal,
            command: command, state: .pending, receipt: nil)
        try await store.saveMealWeek(source, lease: lease)
        try await store.saveMealWeek(target, lease: lease)
        try await store.enqueueMealMove(saved, lease: lease)
        return (store, lease, saved)
    }

    private func receipt(_ saved: SavedMealMove) -> MealMoveReceipt {
        MealMoveReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: saved.command.operationId, entryId: saved.meal.id,
            sourceWeekStart: saved.source.weekStart, targetWeekStart: saved.target.weekStart,
            sourceRevision: "2", targetRevision: "2", date: saved.command.date, slot: .lunch)
    }

    private func updated(_ week: MealWeekSnapshot, entries: [PlannedMeal]) -> MealWeekSnapshot {
        MealWeekSnapshot(
            version: 1, householdId: week.householdId,
            weekStart: week.weekStart, revision: "2", entries: entries)
    }
}
