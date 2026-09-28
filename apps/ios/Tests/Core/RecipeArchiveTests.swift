import Foundation
import XCTest

@testable import NestCore

final class RecipeArchiveTests: XCTestCase {
    func testReceiptCannotChangeActorRecipeOrRevision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = ArchiveRecipe(operationId: UUID(), definitionId: UUID(), expectedRevision: "5")
        let receipt = RecipeArchiveReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: command.definitionId, revision: "6")
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt.validated(
                member: member,
                command: ArchiveRecipe(
                    operationId: command.operationId, definitionId: UUID(), expectedRevision: "5")))
        XCTAssertThrowsError(
            try receipt.validated(
                member: VerifiedMember(
                    userId: UUID(), householdId: member.householdId,
                    displayName: "Other"), command: command))
        XCTAssertThrowsError(
            try receipt.validated(
                member: member,
                command: ArchiveRecipe(
                    operationId: command.operationId, definitionId: command.definitionId, expectedRevision: "6")))
        XCTAssertThrowsError(
            try ArchiveRecipe(operationId: UUID(), definitionId: UUID(), expectedRevision: String(Int64.max))
                .validated())
    }

    func testArchiveSurvivesReopenAndWaitsForRecipeAbsence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "archive-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = ArchiveRecipe(operationId: UUID(), definitionId: UUID(), expectedRevision: "5")
        try await store.enqueueRecipeArchive(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let foreign = try await reopened.activate(
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readRecipeArchive(lease: foreign)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let pending = try await reopened.readRecipeArchive(lease: restored)
        XCTAssertEqual(pending?.command, command)
        do {
            try await reopened.discardConflictedRecipeArchive(lease: restored)
            XCTFail("Discarded uncertain archive")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let receipt = RecipeArchiveReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: command.definitionId, revision: "6")
        try await reopened.acknowledgeRecipeArchive(receipt, lease: restored)
        let recipe = SavedRecipe(
            definitionId: command.definitionId, title: "Soup", servings: 2,
            recipeUrl: nil, notes: nil, instructions: "Simmer.", ingredients: [])
        try await reopened.reconcileRecipeArchive(
            SavedRecipeEnvelope(
                version: 1, householdId: member.householdId,
                revision: "6", recipe: recipe), lease: restored)
        let waiting = try await reopened.readRecipeArchive(lease: restored)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await reopened.reconcileRecipeArchive(
            SavedRecipeEnvelope(
                version: 1, householdId: member.householdId,
                revision: "6", recipe: nil), lease: restored)
        let finished = try await reopened.readRecipeArchive(lease: restored)
        XCTAssertNil(finished)
    }
}
