import Foundation
import XCTest

@testable import NestCore

final class MealWeekStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let entry = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let start = try! MealWeekStart("2026-09-28")

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testPendingPlacementRetainsExactRequestAcrossRestartAndAccountSwitch() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-week-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "0", placed: false)
        try await store.saveMealWeek(week, lease: lease)
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-29"),
            slot: .dinner, title: "Pasta")
        try await store.enqueueMealPlacement(week, command: command, lease: lease)

        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let foreign = try await reopened.readMealPlacement(start, lease: outsiderLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readMealPlacement(start, lease: lease)
            XCTFail("Old lease read another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readMealPlacement(start, lease: restored)
        XCTAssertEqual(saved?.state, .pending)
        XCTAssertEqual(saved?.command, command)
        XCTAssertEqual(saved?.command.expectedRevision, "0")
    }

    func testAcknowledgedPlacementWaitsForObservedWeek() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-week-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let old = try snapshot(revision: "0", placed: false)
        try await store.saveMealWeek(old, lease: lease)
        let command = try PlaceMeal(
            week: old, operationId: UUID(), date: try CivilDate("2026-09-29"),
            slot: .dinner, title: "Pasta")
        try await store.enqueueMealPlacement(old, command: command, lease: lease)
        try await store.acknowledgeMealPlacement(try receipt(command), lease: lease)
        try await store.saveMealWeek(old, lease: lease)
        let pending = try await store.readMealPlacement(start, lease: lease)
        XCTAssertEqual(pending?.state, .acknowledged)
        try await store.saveMealWeek(try snapshot(revision: "1", placed: true), lease: lease)
        let cleared = try await store.readMealPlacement(start, lease: lease)
        XCTAssertNil(cleared)
    }

    func testRejectedPlacementPersistsUntilExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-week-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "0", placed: false)
        try await store.saveMealWeek(week, lease: lease)
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-29"),
            slot: .dinner, title: "Pasta")
        try await store.enqueueMealPlacement(week, command: command, lease: lease)
        try await store.conflictMealPlacement(command.operationId, week: start, lease: lease)
        try await store.saveMealWeek(try snapshot(revision: "1", placed: true), lease: lease)
        let conflict = try await store.readMealPlacement(start, lease: lease)
        XCTAssertEqual(conflict?.state, .conflict)
        try await store.discardConflictedMealPlacement(start, lease: lease)
        let discarded = try await store.readMealPlacement(start, lease: lease)
        XCTAssertNil(discarded)
    }

    func testStaleReadDoesNotReplaceNewerSavedWeek() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-week-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.saveMealWeek(try snapshot(revision: "1", placed: true), lease: lease)
        try await store.saveMealWeek(try snapshot(revision: "0", placed: false), lease: lease)
        let retained = try await store.readMealWeek(start, lease: lease)
        XCTAssertEqual(retained?.revision, "1")
        XCTAssertEqual(retained?.entries.first?.title, "Pasta")
    }

    private func snapshot(revision: String, placed: Bool) throws -> MealWeekSnapshot {
        let row = """
            {"entryId":"\(entry)","date":"2026-09-29","slot":"dinner","title":"Pasta","recipeUrl":null,"notes":null,"definitionId":null,"leftoverSourceId":null}
            """
        let body = """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(revision)","entries":[\(placed ? row : "")]}
            """
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: Data(body.utf8))
    }

    private func receipt(_ command: PlaceMeal) throws -> MealPlacementReceipt {
        let body = """
            {"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","date":"2026-09-29","slot":"dinner","revision":"1"}
            """
        return try JSONDecoder().decode(MealPlacementReceipt.self, from: Data(body.utf8))
    }
}
