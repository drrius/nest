import Foundation
import XCTest

@testable import NestCore

final class RecipeCreationStoreTests: XCTestCase {
    func testRestartIsolationAndExactRecipeReconciliation() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "recipe-create-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = draftCommand()
        try await store.enqueueRecipeCreation(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let foreign = try await reopened.activate(
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readRecipeCreation(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readRecipeCreation(lease: restored)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.discardConflictedRecipeCreation(lease: restored)
            XCTFail("Discarded uncertain save")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let receipt = RecipeCreationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: UUID(), revision: "5")
        try await reopened.acknowledgeRecipeCreation(receipt, lease: restored)
        try await reopened.reconcileRecipeCreation(envelope(receipt, quantity: "201"), lease: restored)
        let waiting = try await reopened.readRecipeCreation(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await reopened.reconcileRecipeCreation(envelope(receipt, quantity: "200"), lease: restored)
        let finished = try await reopened.readRecipeCreation(lease: restored)
        XCTAssertNil(finished)
    }

    func testWrongReceiptAndConflictCannotLosePendingCommand() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "recipe-conflict-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = draftCommand()
        try await store.enqueueRecipeCreation(command, lease: lease)
        do {
            try await store.acknowledgeRecipeCreation(
                RecipeCreationReceipt(
                    version: 1, actorId: UUID(),
                    householdId: member.householdId, operationId: command.operationId, definitionId: UUID(),
                    revision: "5"), lease: lease)
            XCTFail("Accepted another actor")
        } catch {}
        let pending = try await store.readRecipeCreation(lease: lease)
        XCTAssertEqual(pending?.state, .pending)
        try await store.conflictRecipeCreation(command.operationId, lease: lease)
        do {
            try await store.enqueueRecipeCreation(draftCommand(), lease: lease)
            XCTFail("Replaced conflict without explicit discard")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        try await store.discardConflictedRecipeCreation(lease: lease)
        let finished = try await store.readRecipeCreation(lease: lease)
        XCTAssertNil(finished)
    }

    private func draftCommand() -> CreateRecipe {
        CreateRecipe(
            operationId: UUID(), expectedRevision: "3",
            recipe: RecipeDraft(
                title: "Lentils",
                servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
                ingredients: [
                    RecipeIngredientDraft(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)
                ]))
    }

    private func envelope(_ receipt: RecipeCreationReceipt, quantity: String) -> SavedRecipeEnvelope {
        SavedRecipeEnvelope(
            version: 1, householdId: receipt.householdId, revision: receipt.revision,
            recipe: SavedRecipe(
                definitionId: receipt.definitionId, title: "Lentils", servings: 2,
                recipeUrl: nil, notes: nil, instructions: "Simmer.",
                ingredients: [
                    SavedIngredient(
                        ingredientId: UUID(), name: "Lentils", quantity: quantity, unit: "g", categoryId: nil,
                        note: nil, order: 0)
                ]))
    }
}
