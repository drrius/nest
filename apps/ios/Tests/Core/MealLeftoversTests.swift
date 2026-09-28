import Foundation
import XCTest

@testable import NestCore

final class MealLeftoversTests: XCTestCase {
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
