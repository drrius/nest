import Foundation
import XCTest

@testable import NestCore

final class MealProposalApprovalTests: XCTestCase {
    func testApprovalRequiresReadyUnexpiredExactPreview() throws {
        let value = try proposal()
        let command = try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 1))
        _ = try command.validated(against: value)
        XCTAssertThrowsError(
            try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 3_000_000_000))
        )
        XCTAssertThrowsError(try command.validated(against: proposal()))
        // Stored exact retries remain valid even after expiry; the server resolves their operation identity.
        XCTAssertEqual(try JSONDecoder().decode(ApproveMealProposal.self, from: JSONEncoder().encode(command)), command)
    }

    func testReceiptRejectsChangedPostedMealAndRevision() throws {
        let value = try proposal()
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 1))
        let expected = try XCTUnwrap(value.entries?.first)
        let posted = PostedProposalMeal(
            proposalEntryId: expected.id, entryId: UUID(), date: expected.date, slot: expected.slot)
        func receipt(_ rows: [PostedProposalMeal], weekRevision: String = "4") -> MealProposalApprovalReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
                proposalId: value.id, approvedRevision: "1", revision: "2", weekStart: value.weekStart,
                previousWeekRevision: "3", weekRevision: weekRevision, entries: rows)
        }
        _ = try receipt([posted]).validated(member: member, command: command, proposal: value)
        XCTAssertThrowsError(
            try receipt([posted], weekRevision: "5").validated(member: member, command: command, proposal: value))
        let changed = PostedProposalMeal(
            proposalEntryId: expected.id, entryId: UUID(), date: expected.date, slot: .breakfast)
        XCTAssertThrowsError(try receipt([changed]).validated(member: member, command: command, proposal: value))
        XCTAssertThrowsError(try receipt([]).validated(member: member, command: command, proposal: value))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt([posted]).validated(member: other, command: command, proposal: value))
    }

    func testApprovalJournalRetainsExactPreviewUntilConfirmedReadback() async throws {
        let store = try ChoreOfflineStore(
            url: FileManager.default.temporaryDirectory.appending(path: "approval-\(UUID()).sqlite"))
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let lease = try await store.activate(member)
        let value = try proposal()
        let request = GenerateMealProposal(
            operationId: UUID(), weekStart: value.weekStart,
            expectedWeekRevision: value.weekRevision, familiarOnly: false)
        try await store.enqueueProposalGeneration(request, lease: lease)
        try await store.reserveProposalGeneration(
            .init(
                version: 1, actorId: member.userId,
                householdId: member.householdId, operationId: request.operationId, proposalId: value.id,
                revision: "1", weekStart: value.weekStart, expectedWeekRevision: value.weekRevision, familiarOnly: false
            ), lease: lease)
        let preview = MealProposalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, proposal: value)
        try await store.saveGeneratedProposal(preview, lease: lease)
        let operation = UUID()
        try await store.enqueueProposalApproval(
            preview: preview, operation: operation, lease: lease,
            now: Date(timeIntervalSince1970: 1))
        do {
            try await store.discardConflictedProposalApproval(lease: lease)
            XCTFail("Discarded uncertain approval")
        } catch {}
        let pending = try await store.readProposalApproval(lease: lease)
        XCTAssertEqual(pending?.preview, preview)
        XCTAssertEqual(pending?.command.operationId, operation)
        let entry = try XCTUnwrap(value.entries?.first)
        let receipt = MealProposalApprovalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: operation, proposalId: value.id, approvedRevision: "1", revision: "2",
            weekStart: value.weekStart,
            previousWeekRevision: "3", weekRevision: "4",
            entries: [.init(proposalEntryId: entry.id, entryId: UUID(), date: entry.date, slot: entry.slot)])
        try await store.acknowledgeProposalApproval(receipt, lease: lease)
        do {
            try await store.clearConfirmedProposalApproval(lease: lease)
            XCTFail("Cleared before confirmed readback")
        } catch {}
        let approved = MealProposal(
            proposalId: value.id, revision: "2", weekRevision: value.weekRevision,
            weekStart: value.weekStart, familiarOnly: false, entries: value.entries, status: .approved,
            expiresAt: value.expiresAt, failure: nil)
        try await store.saveGeneratedProposal(
            .init(
                version: 1, actorId: member.userId,
                householdId: member.householdId, proposal: approved), lease: lease)
        do {
            try await store.clearTerminalProposalGeneration(operation: request.operationId, lease: lease)
            XCTFail("Cleared proposal with unresolved approval")
        } catch {}
        try await store.clearConfirmedProposalApproval(lease: lease)
        try await store.clearTerminalProposalGeneration(operation: request.operationId, lease: lease)
    }

    private func proposal() throws -> MealProposal {
        let week = try MealWeekStart("2035-06-04")
        let recipe = RecipeDraft(
            title: "Soup", servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
            ingredients: [.init(name: "Lentils", quantity: nil, unit: nil, categoryId: nil, note: nil)])
        return MealProposal(
            proposalId: UUID(), revision: "1", weekRevision: "3", weekStart: week, familiarOnly: false,
            entries: [
                .init(
                    entryId: UUID(), date: week.date, slot: .dinner, source: .suggested(recipe),
                    estimatedCaloriesPerServing: nil)
            ],
            status: .ready, expiresAt: 2_100_000_000_000, failure: nil)
    }
}
