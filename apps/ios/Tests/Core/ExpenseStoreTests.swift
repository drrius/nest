import Foundation
import XCTest

@testable import NestCore

final class ExpenseStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "expense-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let expense = ExpenseInput(
            description: "Groceries", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let command = SaveExpense(operationId: UUID(), expense: expense)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueExpense(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readExpense(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishExpense(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain expense")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueExpense(.init(operationId: UUID(), expense: expense), lease: active)
            XCTFail("Replaced uncertain expense")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readExpense(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readExpense(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        let receipt = ExpenseReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, eventId: UUID(), approvalId: nil, expense: expense)
        try await reopened.confirmExpense(receipt, lease: restored)
        let confirmed = try await reopened.readExpense(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.eventId, receipt.eventId)
        do {
            try await reopened.reconcileExpense(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded expense with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishExpense(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readExpense(lease: restored)
        XCTAssertNil(cleared)
    }
}
