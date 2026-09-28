import Foundation
import XCTest

@testable import NestCore

final class ExpenseApprovalTests: XCTestCase {
    func testConsumedApprovalRequiresExactBoundReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approvalId = UUID()
        let operation = UUID()
        let expense = ExpenseInput(
            description: "Test", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        func envelope(_ status: ExpenseApproval.Status, receipt: ExpenseReceipt?) -> ExpenseApprovalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approvalId, operationId: operation, expense: expense, status: status,
                    expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let receipt = ExpenseReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: operation, eventId: UUID(), approvalId: approvalId, expense: expense)
        _ = try envelope(.consumed, receipt: receipt).validated(member: member, approvalId: approvalId)
        _ = try envelope(.pending, receipt: nil).validated(member: member, approvalId: approvalId)
        XCTAssertThrowsError(try envelope(.consumed, receipt: nil).validated(member: member, approvalId: approvalId))
        XCTAssertThrowsError(try envelope(.pending, receipt: receipt).validated(member: member, approvalId: approvalId))
        let unrelated = ExpenseReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(), eventId: UUID(), approvalId: approvalId, expense: expense)
        XCTAssertThrowsError(
            try envelope(.consumed, receipt: unrelated).validated(member: member, approvalId: approvalId))
        let accept = ExpenseDecision(operationId: operation, approvalId: approvalId, expense: expense, approved: true)
        let deny = ExpenseDecision(operationId: operation, approvalId: approvalId, expense: expense, approved: false)
        _ = try envelope(.consumed, receipt: receipt).matching(accept, member: member, terminal: true)
        _ = try envelope(.denied, receipt: nil).matching(deny, member: member, terminal: true)
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).matching(accept, member: member, terminal: true))
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(deny, member: member, terminal: true))
        let wrong = ExpenseDecision(operationId: UUID(), approvalId: approvalId, expense: expense, approved: true)
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(wrong, member: member, terminal: true))
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).validated(member: foreign, approvalId: approvalId))
    }
}
