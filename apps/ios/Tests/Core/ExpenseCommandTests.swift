import Foundation
import XCTest

@testable import NestCore

final class ExpenseCommandTests: XCTestCase {
    func testReceiptBindsReviewedCommandAndRecoveryCannotInventCompletion() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let expense = ExpenseInput(
            description: "Groceries", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let command = SaveExpense(operationId: UUID(), expense: expense)
        let receipt = ExpenseReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, eventId: UUID(), approvalId: nil, expense: expense)
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt.validated(member: member, command: .init(operationId: UUID(), expense: expense)))
        let changed = ExpenseInput(
            description: "Different", amountCentimes: expense.amountCentimes, receiptPath: nil,
            receiptTotalCentimes: nil, payerId: expense.payerId, allocations: expense.allocations,
            date: expense.date, note: nil, categoryId: nil)
        XCTAssertThrowsError(
            try receipt.validated(member: member, command: .init(operationId: command.operationId, expense: changed)))
        func recovery(_ status: ExpenseRecovery.Status, _ value: ExpenseReceipt?) -> ExpenseRecovery {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, status: status, receipt: value)
        }
        XCTAssertNoThrow(try recovery(.recorded, receipt).validated(member: member, command: command))
        XCTAssertThrowsError(try recovery(.recorded, nil).validated(member: member, command: command))
        XCTAssertThrowsError(try recovery(.cancelled, receipt).validated(member: member, command: command))
        XCTAssertThrowsError(
            try recovery(.unresolved, nil).validated(member: member, command: command, cancellation: true))
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(expense)) as! [String: Any]
        XCTAssertTrue(encoded["note"] is NSNull)
        XCTAssertTrue(encoded["categoryId"] is NSNull)
        XCTAssertNil(encoded["receiptPath"])
        XCTAssertEqual(try JSONDecoder().decode(ExpenseInput.self, from: JSONEncoder().encode(expense)), expense)
    }
}
