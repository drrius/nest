import Foundation
import XCTest

@testable import NestCore

final class RefundDecisionStoreTests: XCTestCase {
    func testRestartPreservesDecisionAndRejectsReplacementOrPrematureDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let refund = RefundInput(
            sourceEventId: UUID(), description: "Test", amountCentimes: try Centimes("101"),
            payerId: member.userId, allocations: shares, expectedRemaining: shares,
            date: try CivilDate("2026-09-28"), note: nil)
        let decision = RefundDecision(operationId: UUID(), approvalId: UUID(), refund: refund, approved: false)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRefundDecision(decision, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readRefundDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        do {
            try await store.enqueueRefundDecision(decision, lease: active)
            XCTFail("Replaced uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishRefundDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readRefundDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readRefundDecision(lease: active)
            XCTFail("Old account lease accepted")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let result = RefundApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, refund: refund,
                status: .denied, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: nil))
        try await store.reconcileRefundDecision(result, lease: restored)
        try await store.finishRefundDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readRefundDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
