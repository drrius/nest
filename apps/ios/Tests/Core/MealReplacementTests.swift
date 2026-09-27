import Foundation
import XCTest

@testable import NestCore

final class MealReplacementTests: XCTestCase {
    func testReceiptCannotReuseOldIdentityOrCrossAccount() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let start = try MealWeekStart("2026-09-28")
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .lunch, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "0", entries: [meal])
        let command = try ReplaceMeal(week: week, meal: meal, operationId: UUID(), title: "Soup")
        for (actor, operation, previous, entry) in [
            (UUID(), command.operationId, meal.id, UUID()),
            (member.userId, UUID(), meal.id, UUID()),
            (member.userId, command.operationId, UUID(), UUID()),
            (member.userId, command.operationId, meal.id, meal.id),
        ] {
            let receipt = MealReplacementReceipt(
                version: 1, actorId: actor,
                householdId: member.householdId, operationId: operation,
                previousEntryId: previous, entryId: entry, weekStart: start,
                date: meal.date, slot: meal.slot, revision: "2", skippedPreparationId: nil)
            XCTAssertThrowsError(try receipt.validated(member: member, command: command))
        }
    }

    func testReplacementPreservesSlotAndRequiresTwoRevisionSteps() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let start = try MealWeekStart("2026-09-28")
        let meal = PlannedMeal(
            entryId: UUID(), date: start.date, slot: .dinner, title: "Pasta",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: "7", entries: [meal])
        let command = try ReplaceMeal(week: week, meal: meal, operationId: UUID(), title: " Soup ")
        XCTAssertEqual(command.title, "Soup")
        XCTAssertEqual(command.date, meal.date)
        XCTAssertEqual(command.slot, meal.slot)
        for revision in ["8", "9", "10"] {
            let receipt = MealReplacementReceipt(
                version: 1, actorId: member.userId,
                householdId: member.householdId, operationId: command.operationId,
                previousEntryId: meal.id, entryId: UUID(), weekStart: start,
                date: meal.date, slot: meal.slot, revision: revision, skippedPreparationId: nil)
            if revision == "9" {
                XCTAssertNoThrow(try receipt.validated(member: member, command: command))
            } else {
                XCTAssertThrowsError(try receipt.validated(member: member, command: command))
            }
        }
        let overflow = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: start, revision: String(Int64.max - 1), entries: [meal])
        XCTAssertThrowsError(try ReplaceMeal(week: overflow, meal: meal, operationId: UUID(), title: "Soup"))
        XCTAssertThrowsError(try ReplaceMeal(week: week, meal: meal, operationId: UUID(), title: " "))
    }
}
