import Foundation
import XCTest

@testable import NestCore

final class ExpenseDecisionStoreTests: XCTestCase {
    func testRestartPreservesDecisionAndRejectsReplacementOrPrematureDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let expense = ExpenseInput(
            description: "Test", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let decision = ExpenseDecision(operationId: UUID(), approvalId: UUID(), expense: expense, approved: false)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueExpenseDecision(decision, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readExpenseDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        do {
            try await store.enqueueExpenseDecision(decision, lease: active)
            XCTFail("Replaced uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishExpenseDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readExpenseDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readExpenseDecision(lease: active)
            XCTFail("Old account lease accepted")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let result = ExpenseApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, expense: expense,
                status: .denied, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: nil))
        try await store.reconcileExpenseDecision(result, lease: restored)
        try await store.finishExpenseDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readExpenseDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
