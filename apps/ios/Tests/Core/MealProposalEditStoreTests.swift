import Foundation
import XCTest

@testable import NestCore

final class MealProposalEditStoreTests: XCTestCase {
    func testEditProtectsUncertainOperationAndExcludesDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "edit-proposal-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let lease = try await store.activate(member)
        let week = try MealWeekStart("2035-06-04")
        let recipe = RecipeDraft(
            title: "Soup", servings: 2, instructions: "Simmer", recipeUrl: nil, notes: nil,
            ingredients: [.init(name: "Lentils", quantity: nil, unit: nil, categoryId: nil, note: nil)])
        let entry = ProposedMeal(
            entryId: UUID(), date: week.date, slot: .dinner, source: .suggested(recipe),
            estimatedCaloriesPerServing: nil)
        let proposal = MealProposal(
            proposalId: UUID(), revision: "2", weekRevision: "0", weekStart: week,
            familiarOnly: false, entries: [entry], status: .ready, expiresAt: 2_100_000_000_000, failure: nil)
        let preview = MealProposalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, proposal: proposal)
        let generation = GenerateMealProposal(
            operationId: UUID(), weekStart: week, expectedWeekRevision: "0", familiarOnly: false)
        try await store.enqueueProposalGeneration(generation, lease: lease)
        try await store.reserveProposalGeneration(
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: generation.operationId, proposalId: proposal.id, revision: "1", weekStart: week,
                expectedWeekRevision: "0", familiarOnly: false), lease: lease)
        try await store.saveGeneratedProposal(preview, lease: lease)
        let command = MealProposalEditCommand(
            action: .replace, operationId: UUID(), proposalId: proposal.id,
            expectedRevision: "2", entryId: entry.id, definitionId: nil, expectedLibraryRevision: nil)
        try await store.enqueueProposalEdit(preview: preview, command: command, lease: lease)
        do {
            try await store.enqueueProposalDiscard(preview: preview, operation: UUID(), lease: lease)
            XCTFail("Discard raced with edit")
        } catch {}
        do {
            try await store.clearRejectedProposalEdit(lease: lease)
            XCTFail("Deleted uncertain edit")
        } catch {}
        let reopened = try ChoreOfflineStore(url: url)
        let restored = try await reopened.activate(member)
        let retained = try await reopened.readProposalEdit(lease: restored)
        XCTAssertEqual(retained?.command, command)
        try await reopened.conflictProposalEdit(operation: command.operationId, lease: restored)
        try await reopened.clearRejectedProposalEdit(lease: restored)
        let cleared = try await reopened.readProposalEdit(lease: restored)
        XCTAssertNil(cleared)
    }
}
