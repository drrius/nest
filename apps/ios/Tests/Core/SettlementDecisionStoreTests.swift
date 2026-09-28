import Foundation
import XCTest

@testable import NestCore

final class SettlementDecisionStoreTests: XCTestCase {
    func testRestartPreservesDecisionAndRejectsReplacementOrPrematureDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let settlement = SettlementInput(
            description: "Payment", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId, recipientId: UUID(),
            mode: .full, date: try CivilDate("2026-09-28"), note: nil)
        let decision = SettlementDecision(
            operationId: UUID(), approvalId: UUID(), settlement: settlement, approved: false)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueSettlementDecision(decision, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readSettlementDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        do {
            try await store.enqueueSettlementDecision(decision, lease: active)
            XCTFail("Replaced uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishSettlementDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readSettlementDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readSettlementDecision(lease: active)
            XCTFail("Old account lease accepted")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let result = SettlementApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, settlement: settlement,
                status: .denied, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: nil))
        try await store.reconcileSettlementDecision(result, lease: restored)
        try await store.finishSettlementDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readSettlementDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
