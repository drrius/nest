import Foundation
import XCTest

@testable import NestCore

final class ChoreTransferTests: XCTestCase {
    func testOnlyRecipientCanAcceptExactPendingHandover() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Recipient")
        let pending = PendingChoreTransfer(
            requestId: UUID(), occurrenceId: UUID(), dueDate: try CivilDate("2026-09-28"),
            fromMemberId: UUID(), toMemberId: member.userId, title: "Tidy")
        for action: RespondChoreTransfer.Action in [.accept, .decline] {
            let command = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: action)
            let receipt = ChoreTransferReceipt(
                requestId: pending.requestId, occurrenceId: pending.occurrenceId, dueDate: pending.dueDate,
                fromMemberId: pending.fromMemberId, toMemberId: member.userId, actorId: member.userId,
                householdId: member.householdId, operationId: command.operationId,
                action: action.rawValue, state: action == .accept ? "accepted" : "declined")
            XCTAssertEqual(try receipt.validated(member: member, command: command, pending: pending), receipt)
            let sender = VerifiedMember(
                userId: pending.fromMemberId, householdId: member.householdId, displayName: "Sender")
            XCTAssertThrowsError(try receipt.validated(member: sender, command: command, pending: pending))
            let wrongPending = PendingChoreTransfer(
                requestId: pending.requestId, occurrenceId: UUID(), dueDate: pending.dueDate,
                fromMemberId: pending.fromMemberId, toMemberId: member.userId, title: "Other")
            XCTAssertThrowsError(try receipt.validated(member: member, command: command, pending: wrongPending))
            let opposite = RespondChoreTransfer(
                operationId: command.operationId, requestId: command.requestId,
                action: action == .accept ? .decline : .accept)
            XCTAssertThrowsError(try receipt.validated(member: member, command: opposite, pending: pending))
        }
    }

    func testRequestReceiptMustPreserveRecipientAndDueDate() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sender")
        let command = RequestChoreTransfer(
            operationId: UUID(), occurrenceId: UUID(), expectedDueDate: try CivilDate("2026-09-28"), recipientId: UUID()
        )
        let receipt = ChoreTransferReceipt(
            requestId: UUID(), occurrenceId: command.occurrenceId, dueDate: command.expectedDueDate,
            fromMemberId: member.userId, toMemberId: command.recipientId, actorId: member.userId,
            householdId: member.householdId, operationId: command.operationId, action: "request", state: "pending")
        XCTAssertEqual(try receipt.validated(member: member, command: command), receipt)
        let other = RequestChoreTransfer(
            operationId: command.operationId, occurrenceId: command.occurrenceId,
            expectedDueDate: command.expectedDueDate, recipientId: UUID())
        XCTAssertThrowsError(try receipt.validated(member: member, command: other))
    }
}
