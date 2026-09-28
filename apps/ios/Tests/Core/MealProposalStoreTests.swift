import Foundation
import XCTest

@testable import NestCore

final class MealProposalStoreTests: XCTestCase {
    func testInterruptedGenerationSurvivesRestartAndCannotBeReplaced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "proposal-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: try MealWeekStart("2035-06-04"),
            expectedWeekRevision: "0", familiarOnly: false)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueProposalGeneration(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let partner = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Partner"))
        let hidden = try await reopened.readProposalGeneration(lease: partner)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readProposalGeneration(lease: restored)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.enqueueProposalGeneration(command, lease: restored)
            XCTFail("Replaced uncertain operation")
        } catch {}
        do {
            try await reopened.clearTerminalProposalGeneration(operation: command.operationId, lease: restored)
            XCTFail("Discarded unresolved operation")
        } catch {}
        let receipt = MealProposalGenerationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, proposalId: UUID(), revision: "1", weekStart: command.weekStart,
            expectedWeekRevision: "0", familiarOnly: false)
        try await reopened.reserveProposalGeneration(receipt, lease: restored)
        func envelope(_ revision: String, _ status: MealProposal.Status) -> MealProposalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                proposal: .init(
                    proposalId: receipt.proposalId, revision: revision, weekRevision: "0",
                    weekStart: command.weekStart, familiarOnly: false, entries: nil, status: status, expiresAt: 1,
                    failure: nil))
        }
        let unfinished = envelope("1", .generating)
        try await reopened.saveGeneratedProposal(unfinished, lease: restored)
        let discardOperation = UUID()
        try await reopened.enqueueProposalDiscard(preview: unfinished, operation: discardOperation, lease: restored)
        do {
            try await reopened.discardConflictedProposalDiscard(lease: restored)
            XCTFail("Discarded uncertain discard operation")
        } catch {}
        let pendingDiscard = try await reopened.readProposalDiscard(lease: restored)
        XCTAssertEqual(pendingDiscard?.command.operationId, discardOperation)
        let discardReceipt = MealProposalDiscardReceipt(
            version: 1, actorId: member.userId,
            householdId: member.householdId, operationId: discardOperation, proposalId: receipt.proposalId,
            previousRevision: "1", revision: "2")
        try await reopened.acknowledgeProposalDiscard(discardReceipt, lease: restored)
        do {
            try await reopened.clearConfirmedProposalDiscard(lease: restored)
            XCTFail("Cleared before confirmed discard")
        } catch {}
        let terminal = envelope("2", .discarded)
        try await reopened.saveGeneratedProposal(terminal, lease: restored)
        try await reopened.saveGeneratedProposal(envelope("1", .generating), lease: restored)
        let retained = try await reopened.readProposalGeneration(lease: restored)
        XCTAssertEqual(retained?.envelope, terminal)
        try await reopened.clearConfirmedProposalDiscard(lease: restored)
        try await reopened.clearTerminalProposalGeneration(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readProposalGeneration(lease: restored)
        XCTAssertNil(cleared)
    }
}
