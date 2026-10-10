import Foundation
import XCTest

@testable import NestCore

final class RefundApprovalTests: XCTestCase {
    func testConsumedApprovalRequiresExactBoundReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approvalId = UUID()
        let operation = UUID()
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let refund = RefundInput(
            sourceEventId: UUID(), description: "Test", amountCentimes: try Centimes("101"),
            payerId: member.userId, allocations: shares, expectedRemaining: shares,
            date: try CivilDate("2026-09-28"), note: nil)
        func envelope(_ status: RefundApproval.Status, receipt: RefundReceipt?) -> RefundApprovalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approvalId, operationId: operation, refund: refund, status: status,
                    expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let receipt = RefundReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: operation, eventId: UUID(), approvalId: approvalId, refund: refund)
        _ = try envelope(.consumed, receipt: receipt).validated(member: member, approvalId: approvalId)
        _ = try envelope(.pending, receipt: nil).validated(member: member, approvalId: approvalId)
        XCTAssertThrowsError(try envelope(.consumed, receipt: nil).validated(member: member, approvalId: approvalId))
        XCTAssertThrowsError(try envelope(.pending, receipt: receipt).validated(member: member, approvalId: approvalId))
        let unrelated = RefundReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(), eventId: UUID(), approvalId: approvalId, refund: refund)
        XCTAssertThrowsError(
            try envelope(.consumed, receipt: unrelated).validated(member: member, approvalId: approvalId))
        let accept = RefundDecision(operationId: operation, approvalId: approvalId, refund: refund, approved: true)
        let deny = RefundDecision(operationId: operation, approvalId: approvalId, refund: refund, approved: false)
        _ = try envelope(.consumed, receipt: receipt).matching(accept, member: member, terminal: true)
        _ = try envelope(.denied, receipt: nil).matching(deny, member: member, terminal: true)
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).matching(accept, member: member, terminal: true))
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(deny, member: member, terminal: true))
        let wrong = RefundDecision(operationId: UUID(), approvalId: approvalId, refund: refund, approved: true)
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(wrong, member: member, terminal: true))
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).validated(member: foreign, approvalId: approvalId))
    }
}
