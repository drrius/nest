import Foundation
import XCTest

@testable import NestCore

final class RefundStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "refund-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let allocations = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let refund = RefundInput(
            sourceEventId: UUID(), description: "Refund", amountCentimes: try Centimes("101"),
            payerId: member.userId, allocations: allocations, expectedRemaining: allocations,
            date: try CivilDate("2026-09-28"), note: nil)
        let command = SaveRefund(operationId: UUID(), refund: refund)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRefund(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readRefund(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishRefund(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain refund")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueRefund(.init(operationId: UUID(), refund: refund), lease: active)
            XCTFail("Replaced uncertain refund")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readRefund(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readRefund(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestRefundCancellation(lease: restored)
        let cancelledIntent = try await reopened.readRefund(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = RefundReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, eventId: UUID(), approvalId: nil, refund: refund)
        try await reopened.confirmRefund(receipt, lease: restored)
        let confirmed = try await reopened.readRefund(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.eventId, receipt.eventId)
        do {
            try await reopened.reconcileRefund(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded refund with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishRefund(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readRefund(lease: restored)
        XCTAssertNil(cleared)
    }
}
