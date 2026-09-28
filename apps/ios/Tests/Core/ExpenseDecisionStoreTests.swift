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
    func testOnlyMatchingServerExpiryReleasesSavedDecisionAfterRestart() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "expiry-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let expense = ExpenseInput(
            description: "Test", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let decision = ExpenseDecision(operationId: UUID(), approvalId: UUID(), expense: expense, approved: true)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueExpenseDecision(decision, lease: lease)
        func evidence(_ expired: Bool, operation: UUID) -> FinancialApprovalExpiry {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: operation, command: .expense,
                expiredUnused: expired, checkedAt: "2026-09-28T08:00:00.000000Z")
        }
        do {
            try await store.expireExpenseDecision(evidence(false, operation: decision.operationId), lease: lease)
            XCTFail("Non-expiry released decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.expireExpenseDecision(evidence(true, operation: UUID()), lease: lease)
            XCTFail("Unrelated expiry accepted")
        } catch NestAPIFailure.contract {}
        try await store.expireExpenseDecision(evidence(true, operation: decision.operationId), lease: lease)
        let restarted = try ChoreOfflineStore(url: url)
        let active = try await restarted.activate(member)
        let saved = try await restarted.readExpenseDecision(lease: active)
        XCTAssertTrue(saved?.isTerminal == true)
        XCTAssertEqual(saved?.decision, decision)
        try await restarted.finishExpenseDecision(approvalId: decision.approvalId, lease: active)
        let cleared = try await restarted.readExpenseDecision(lease: active)
        XCTAssertNil(cleared)
    }

}
