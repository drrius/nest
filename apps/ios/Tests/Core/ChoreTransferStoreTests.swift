import Foundation
import XCTest

@testable import NestCore

final class ChoreTransferStoreTests: XCTestCase {
    func testRecipientDecisionSurvivesRestartAndRejectsReplacement() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "handover-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Recipient")
        let pending = PendingChoreTransfer(
            requestId: UUID(), occurrenceId: UUID(), dueDate: try CivilDate("2026-09-28"),
            fromMemberId: UUID(), toMemberId: member.userId, title: "Tidy")
        let response = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: .accept)
        let command = SavedTransferCommand.respond(response, pending)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueChoreTransfer(command, title: pending.title, lease: lease)
        do {
            try await store.finishChoreTransfer(operation: command.operationId, lease: lease)
            XCTFail("Pending decision erased")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let sender = VerifiedMember(
            userId: pending.fromMemberId, householdId: member.householdId, displayName: "Sender")
        let senderLease = try await reopened.activate(sender)
        let hidden = try await reopened.readChoreTransfer(lease: senderLease)
        XCTAssertNil(hidden)
        let current = try await reopened.activate(member)
        let restored = try await reopened.readChoreTransfer(lease: current)
        XCTAssertEqual(restored?.command, command)
        do {
            let decline = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: .decline)
            try await reopened.enqueueChoreTransfer(.respond(decline, pending), title: pending.title, lease: current)
            XCTFail("Pending acceptance replaced")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        let receipt = ChoreTransferReceipt(
            requestId: pending.requestId, occurrenceId: pending.occurrenceId, dueDate: pending.dueDate,
            fromMemberId: pending.fromMemberId, toMemberId: member.userId, actorId: member.userId,
            householdId: member.householdId, operationId: command.operationId, action: "accept", state: "accepted")
        try await reopened.acknowledgeChoreTransfer(receipt, lease: current)
        try await reopened.acknowledgeChoreTransfer(receipt, lease: current)
        try await reopened.finishChoreTransfer(operation: command.operationId, lease: current)
        let finished = try await reopened.readChoreTransfer(lease: current)
        XCTAssertNil(finished)
        XCTAssertThrowsError(try command.validate(actor: sender.userId))
    }
}
