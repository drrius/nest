import Foundation
import XCTest

@testable import NestCore

final class MealLeftoversTests: XCTestCase {
    func testCrossWeekReceiptDoesNotAdvanceSourceRevision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let start = try MealWeekStart("2026-09-28")
        let next = try start.adjacent(1)
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let source = MealWeekSnapshot(
            version: 1, householdId: member.householdId, weekStart: start, revision: "4", entries: [meal])
        let target = MealWeekSnapshot(
            version: 1, householdId: member.householdId, weekStart: next, revision: "8", entries: [])
        let placement = try PlaceLeftovers(
            source: source, target: target, meal: meal,
            operationId: UUID(), date: next.date, slot: .lunch)
        for revision in ["4", "5"] {
            let receipt = LeftoverPlacementReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: placement.command.operationId, entryId: UUID(), sourceEntryId: meal.id,
                sourceWeekStart: start, targetWeekStart: next, sourceRevision: revision, targetRevision: "9",
                date: next.date, slot: .lunch)
            if revision == "4" {
                XCTAssertNoThrow(try receipt.validated(member: member, placement: placement))
            } else {
                XCTAssertThrowsError(try receipt.validated(member: member, placement: placement))
            }
        }
    }

    func testLeftoversRequireEarlierOriginalAndSerializeBackendShape() throws {
        let household = UUID()
        let start = try MealWeekStart("2026-09-28")
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let week = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start, revision: "1", entries: [meal])
        XCTAssertThrowsError(
            try PlaceLeftovers(
                source: week, target: week, meal: meal,
                operationId: UUID(), date: start.date, slot: .lunch))
        let placement = try PlaceLeftovers(
            source: week, target: week, meal: meal,
            operationId: UUID(), date: start.days[1], slot: .lunch)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(placement)) as? [String: Any])
        XCTAssertNil(json["command"])
        XCTAssertEqual(json["entryId"] as? String, meal.id.uuidString)
        let chain = PlannedMeal(
            entryId: meal.id, date: meal.date, slot: meal.slot, title: meal.title,
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: UUID())
        let chained = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start, revision: "1", entries: [chain])
        XCTAssertThrowsError(
            try PlaceLeftovers(
                source: chained, target: chained, meal: chain,
                operationId: UUID(), date: start.days[1], slot: .lunch))
    }
}
