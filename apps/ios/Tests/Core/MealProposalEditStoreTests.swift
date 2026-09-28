import Foundation
import XCTest

@testable import NestCore

final class MealProposalEditStoreTests: XCTestCase {
    func testEditProtectsUncertainOperationAndExcludesDiscard() async throws {
        try await exerciseEditReadback(tamper: false)
    }

    func testUnrelatedMealChangeRetainsAppliedEditForRecovery() async throws {
        try await exerciseEditReadback(tamper: true)
    }

    private func exerciseEditReadback(tamper: Bool) async throws {
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
        let unrelated = ProposedMeal(
            entryId: UUID(), date: week.date, slot: .lunch, source: .suggested(recipe),
            estimatedCaloriesPerServing: nil)
        let proposal = MealProposal(
            proposalId: UUID(), revision: "2", weekRevision: "0", weekStart: week,
            familiarOnly: false, entries: [entry, unrelated], status: .ready, expiresAt: 2_100_000_000_000, failure: nil
        )
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
        try await verifyAppliedReadback(
            store: reopened, lease: restored, preview: preview, command: command, tamper: tamper)
    }

    private func verifyAppliedReadback(
        store: ChoreOfflineStore, lease: OfflineLease,
        preview: MealProposalEnvelope, command: MealProposalEditCommand, tamper: Bool
    ) async throws {
        try await store.enqueueProposalEdit(preview: preview, command: command, lease: lease)
        let receipt = MealProposalChangeReceipt(
            version: 1, actorId: lease.actor, householdId: lease.household,
            operationId: command.operationId, proposalId: command.proposalId, previousRevision: "2", revision: "3",
            entryId: command.entryId, action: .replace, definitionId: nil, expectedLibraryRevision: nil)
        let result = MealProposalEdit(
            version: 1, actorId: lease.actor, householdId: lease.household, command: command,
            expiresAt: 2_100_000_000_000, status: .applied, failure: nil, receipt: receipt)
        try await store.saveProposalEditResult(result, lease: lease)
        do {
            try await store.clearAppliedProposalEdit(lease: lease)
            XCTFail("Cleared before updated proposal readback")
        } catch {}
        let pending = MealProposalEdit(
            version: 1, actorId: lease.actor, householdId: lease.household, command: command,
            expiresAt: result.expiresAt, status: .pending, failure: nil, receipt: nil)
        do {
            try await store.saveProposalEditResult(pending, lease: lease)
            XCTFail("Regressed applied edit to pending")
        } catch {}
        let old = preview.proposal
        var entries = try XCTUnwrap(old.entries)
        if tamper {
            let unrelated = entries[1]
            entries[1] = ProposedMeal(
                entryId: unrelated.id, date: unrelated.date, slot: unrelated.slot, source: unrelated.source,
                estimatedCaloriesPerServing: 999)
        }
        let fresh = MealProposal(
            proposalId: old.id, revision: "3", weekRevision: old.weekRevision,
            weekStart: old.weekStart, familiarOnly: old.familiarOnly, entries: entries, status: .ready,
            expiresAt: old.expiresAt, failure: nil)
        try await store.saveGeneratedProposal(
            .init(
                version: 1, actorId: lease.actor, householdId: lease.household,
                proposal: fresh), lease: lease)
        if tamper {
            do {
                try await store.clearAppliedProposalEdit(lease: lease)
                XCTFail("Cleared edit despite unrelated meal changing")
            } catch OfflineFailure.storage {}
            let retained = try await store.readProposalEdit(lease: lease)
            XCTAssertEqual(retained?.command, command)
            XCTAssertEqual(retained?.result, result)
            return
        }
        try await store.clearAppliedProposalEdit(lease: lease)
        let finished = try await store.readProposalEdit(lease: lease)
        XCTAssertNil(finished)
    }
}
