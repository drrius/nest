import Foundation
import XCTest

@testable import NestCore

final class MealRemovalStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let entry = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let start = try! MealWeekStart("2026-09-28")

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testPendingRemovalSurvivesRestartAndAccountSwitch() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "1", containsMeal: true)
        let meal = try XCTUnwrap(week.entries.first)
        let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealRemoval(week, meal: meal, command: command, lease: lease)

        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let foreign = try await reopened.readMealRemoval(start, lease: outsiderLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readMealRemoval(start, lease: lease)
            XCTFail("Old lease read another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readMealRemoval(start, lease: restored)
        XCTAssertEqual(saved?.state, .pending)
        XCTAssertEqual(saved?.command, command)
        let placement = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-30"),
            slot: .dinner, title: "Soup")
        do {
            try await reopened.enqueueMealPlacement(week, command: placement, lease: restored)
            XCTFail("Placement bypassed a pending removal")
        } catch { XCTAssertEqual(error as? OfflineFailure, .missingSnapshot) }
    }

    func testAcknowledgedRemovalWaitsForObservedAbsence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "1", containsMeal: true)
        let meal = try XCTUnwrap(week.entries.first)
        let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealRemoval(week, meal: meal, command: command, lease: lease)
        try await store.acknowledgeMealRemoval(try receipt(command), lease: lease)
        try await store.saveMealWeek(week, lease: lease)
        let waiting = try await store.readMealRemoval(start, lease: lease)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await store.saveMealWeek(try snapshot(revision: "2", containsMeal: true), lease: lease)
        let stillPresent = try await store.readMealRemoval(start, lease: lease)
        XCTAssertEqual(stillPresent?.state, .acknowledged)
        try await store.saveMealWeek(try snapshot(revision: "3", containsMeal: false), lease: lease)
        let cleared = try await store.readMealRemoval(start, lease: lease)
        XCTAssertNil(cleared)
    }

    func testRejectedRemovalRequiresExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "1", containsMeal: true)
        let meal = try XCTUnwrap(week.entries.first)
        let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealRemoval(week, meal: meal, command: command, lease: lease)
        try await store.conflictMealRemoval(command.operationId, week: start, lease: lease)
        try await store.saveMealWeek(try snapshot(revision: "2", containsMeal: false), lease: lease)
        let rejected = try await store.readMealRemoval(start, lease: lease)
        XCTAssertEqual(rejected?.state, .conflict)
        try await store.discardConflictedMealRemoval(start, lease: lease)
        let discarded = try await store.readMealRemoval(start, lease: lease)
        XCTAssertNil(discarded)
    }

    private func snapshot(revision: String, containsMeal: Bool) throws -> MealWeekSnapshot {
        let row = """
            {"entryId":"\(entry)","date":"2026-09-29","slot":"dinner","title":"Pasta","recipeUrl":null,"notes":null,"definitionId":null,"leftoverSourceId":null}
            """
        let body = """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(revision)","entries":[\(containsMeal ? row : "")]}
            """
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: Data(body.utf8))
    }

    private func receipt(_ command: RemoveMeal) throws -> MealRemovalReceipt {
        let body = """
            {"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","revision":"2","removed":true,"skippedPreparationId":null}
            """
        return try JSONDecoder().decode(MealRemovalReceipt.self, from: Data(body.utf8))
    }
}
