import Foundation
import XCTest

@testable import NestCore

final class MealIngredientStoreTests: XCTestCase {
    func testRestartScopeAndUncertainRequestProtection() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "ingredients-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try MealWeekStart("2035-06-04")
        let choice = MealIngredientChoice(
            ingredient: .init(entryId: UUID(), ingredientId: UUID(), quantity: "1/2", unit: "cup"), selected: true)
        let draft = try await store.saveIngredientReview(
            week: week, revision: "2", choices: [choice], expectedSequence: nil, lease: lease)
        let command = AddMealIngredients(
            operationId: UUID(), weekStart: week, expectedRevision: "2", selected: [choice.ingredient])
        _ = try await store.stageIngredientAddition(command, expectedSequence: draft.sequence, lease: lease)
        do {
            _ = try await store.saveIngredientReview(
                week: week, revision: "3", choices: [], expectedSequence: draft.sequence, lease: lease)
            XCTFail("Overwrote uncertain request")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        do {
            try await store.discardConflictedIngredientAddition(
                week: week, operation: command.operationId, lease: lease)
            XCTFail("Discarded uncertain request")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let foreign = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readIngredientReview(week: week, lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readIngredientReview(week: week, lease: restored)
        XCTAssertEqual(saved?.pending, command)
        let receipt = MealIngredientsReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, weekStart: week, weekRevision: "2",
            ingredients: [
                .init(
                    entryId: choice.ingredient.entryId, ingredientId: choice.ingredient.ingredientId, itemId: UUID(),
                    outcome: .added)
            ])
        try await reopened.acknowledgeIngredientAddition(receipt, lease: restored)
        let confirmed = try await reopened.readIngredientReview(week: week, lease: restored)
        XCTAssertEqual(confirmed?.receipt, receipt)
        XCTAssertNil(confirmed?.pending)
    }

    func testStaleDraftAndConflictRequireExplicitRecovery() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "ingredient-conflict-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(.init(userId: UUID(), householdId: UUID(), displayName: "Test"))
        let week = try MealWeekStart("2035-06-04")
        let choice = MealIngredientChoice(
            ingredient: .init(entryId: UUID(), ingredientId: UUID(), quantity: nil, unit: nil), selected: true)
        let draft = try await store.saveIngredientReview(
            week: week, revision: "2", choices: [choice], expectedSequence: nil, lease: lease)
        do {
            _ = try await store.saveIngredientReview(
                week: week, revision: "2", choices: [], expectedSequence: nil, lease: lease)
            XCTFail("Overwrote newer draft")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let command = AddMealIngredients(
            operationId: UUID(), weekStart: week, expectedRevision: "2", selected: [choice.ingredient])
        _ = try await store.stageIngredientAddition(command, expectedSequence: draft.sequence, lease: lease)
        try await store.conflictIngredientAddition(week: week, operation: command.operationId, lease: lease)
        let conflict = try await store.readIngredientReview(week: week, lease: lease)
        XCTAssertEqual(conflict?.pending, command)
        XCTAssertEqual(conflict?.conflicted, true)
        try await store.discardConflictedIngredientAddition(week: week, operation: command.operationId, lease: lease)
        let recovered = try await store.readIngredientReview(week: week, lease: lease)
        XCTAssertNil(recovered?.pending)
        XCTAssertEqual(recovered?.choices, [choice])
    }
}
