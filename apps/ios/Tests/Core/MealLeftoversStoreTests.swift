import Foundation
import XCTest

@testable import NestCore

final class MealLeftoversStoreTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")

    func testCrossWeekPreservesSourceAndRequiresLinkedNewEntry() async throws {
        let (store, lease, saved) = try await fixture()
        let accepted = receipt(saved)
        try await store.acknowledgeMealLeftovers(accepted, lease: lease)
        let wrong = PlannedMeal(
            entryId: accepted.entryId, date: accepted.date, slot: .lunch,
            title: saved.meal.title, recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        try await store.saveMealWeek(updated(saved.target, entries: [wrong]), lease: lease)
        let waiting = try await store.readMealLeftovers(lease: lease)
        XCTAssertEqual(waiting?.state, .acknowledged)
        let linked = PlannedMeal(
            entryId: accepted.entryId, date: accepted.date, slot: .lunch,
            title: saved.meal.title, recipeUrl: nil, notes: nil, definitionId: nil,
            leftoverSourceId: saved.meal.id)
        try await store.saveMealWeek(updated(saved.target, entries: [linked]), lease: lease)
        let finished = try await store.readMealLeftovers(lease: lease)
        let source = try await store.readMealWeek(saved.source.weekStart, lease: lease)
        XCTAssertNil(finished)
        XCTAssertEqual(source, saved.source)
    }

    func testSameWeekCannotConfirmIfOriginalDisappears() async throws {
        let (store, lease, saved) = try await fixture(sameWeek: true)
        let accepted = receipt(saved)
        try await store.acknowledgeMealLeftovers(accepted, lease: lease)
        let linked = PlannedMeal(
            entryId: accepted.entryId, date: accepted.date, slot: .lunch,
            title: saved.meal.title, recipeUrl: nil, notes: nil, definitionId: nil,
            leftoverSourceId: saved.meal.id)
        try await store.saveMealWeek(updated(saved.source, entries: [linked]), lease: lease)
        let waiting = try await store.readMealLeftovers(lease: lease)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await store.saveMealWeek(updated(saved.source, entries: [saved.meal, linked]), lease: lease)
        let finished = try await store.readMealLeftovers(lease: lease)
        XCTAssertNil(finished)
    }

    func testWrongReceiptAndPendingDiscardCannotLoseOperation() async throws {
        let (store, lease, saved) = try await fixture()
        let wrong = LeftoverPlacementReceipt(
            version: 1, actorId: UUID(), householdId: member.householdId,
            operationId: saved.placement.command.operationId, entryId: UUID(), sourceEntryId: saved.meal.id,
            sourceWeekStart: saved.source.weekStart, targetWeekStart: saved.target.weekStart,
            sourceRevision: saved.source.weekStart == saved.target.weekStart ? "2" : "1", targetRevision: "2",
            date: saved.placement.command.date, slot: .lunch)
        do {
            try await store.acknowledgeMealLeftovers(wrong, lease: lease)
            XCTFail("Accepted another actor's receipt")
        } catch {}
        do {
            try await store.discardConflictedMealLeftovers(lease: lease)
            XCTFail("Discarded an uncertain write")
        } catch {}
        let pending = try await store.readMealLeftovers(lease: lease)
        XCTAssertEqual(pending, saved)
        try await store.conflictMealLeftovers(saved.placement.command.operationId, lease: lease)
        try await store.discardConflictedMealLeftovers(lease: lease)
        let discarded = try await store.readMealLeftovers(lease: lease)
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
        let hidden = try await store.readMealLeftovers(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await store.activate(member)
        let pending = try await store.readMealLeftovers(lease: restored)
        XCTAssertEqual(pending?.placement.command.operationId, saved.placement.command.operationId)
    }

    private func fixture(sameWeek: Bool = false) async throws -> (ChoreOfflineStore, OfflineLease, SavedMealLeftovers) {
        let url = FileManager.default.temporaryDirectory.appending(path: "move-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let start = try MealWeekStart("2026-09-28")
        let next = sameWeek ? start : try start.adjacent(1)
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let source = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "1", entries: [meal])
        let target =
            sameWeek
            ? source
            : MealWeekSnapshot(
                version: 1, householdId: member.householdId,
                weekStart: next, revision: "1", entries: [])
        let command = try PlaceLeftovers(
            source: source, target: target, meal: meal,
            operationId: UUID(), date: sameWeek ? try CivilDate("2026-09-29") : next.date, slot: .lunch)
        let saved = SavedMealLeftovers(
            source: source, target: target, meal: meal,
            placement: command, state: .pending, receipt: nil)
        try await store.saveMealWeek(source, lease: lease)
        try await store.saveMealWeek(target, lease: lease)
        try await store.enqueueMealLeftovers(saved, lease: lease)
        return (store, lease, saved)
    }

    private func receipt(_ saved: SavedMealLeftovers) -> LeftoverPlacementReceipt {
        LeftoverPlacementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: saved.placement.command.operationId, entryId: UUID(), sourceEntryId: saved.meal.id,
            sourceWeekStart: saved.source.weekStart, targetWeekStart: saved.target.weekStart,
            sourceRevision: saved.source.weekStart == saved.target.weekStart ? "2" : "1", targetRevision: "2",
            date: saved.placement.command.date, slot: .lunch)
    }

    private func updated(_ week: MealWeekSnapshot, entries: [PlannedMeal]) -> MealWeekSnapshot {
        MealWeekSnapshot(
            version: 1, householdId: week.householdId,
            weekStart: week.weekStart, revision: "2", entries: entries)
    }
}
