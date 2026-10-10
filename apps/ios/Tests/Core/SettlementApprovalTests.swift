import Foundation
import XCTest

@testable import NestCore

final class SettlementApprovalTests: XCTestCase {
    func testConsumedApprovalRequiresExactBoundReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approvalId = UUID()
        let operation = UUID()
        let settlement = SettlementInput(
            description: "Payment", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId, recipientId: UUID(),
            mode: .full, date: try CivilDate("2026-09-28"), note: nil)
        func envelope(_ status: SettlementApproval.Status, receipt: SettlementReceipt?) -> SettlementApprovalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approvalId, operationId: operation, settlement: settlement, status: status,
                    expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let receipt = SettlementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: operation, eventId: UUID(), approvalId: approvalId, settlement: settlement)
        _ = try envelope(.consumed, receipt: receipt).validated(member: member, approvalId: approvalId)
        _ = try envelope(.pending, receipt: nil).validated(member: member, approvalId: approvalId)
        XCTAssertThrowsError(try envelope(.consumed, receipt: nil).validated(member: member, approvalId: approvalId))
        XCTAssertThrowsError(try envelope(.pending, receipt: receipt).validated(member: member, approvalId: approvalId))
        let unrelated = SettlementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(), eventId: UUID(), approvalId: approvalId, settlement: settlement)
        XCTAssertThrowsError(
            try envelope(.consumed, receipt: unrelated).validated(member: member, approvalId: approvalId))
        let accept = SettlementDecision(
            operationId: operation, approvalId: approvalId, settlement: settlement, approved: true)
        let deny = SettlementDecision(
            operationId: operation, approvalId: approvalId, settlement: settlement, approved: false)
        _ = try envelope(.consumed, receipt: receipt).matching(accept, member: member, terminal: true)
        _ = try envelope(.denied, receipt: nil).matching(deny, member: member, terminal: true)
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).matching(accept, member: member, terminal: true))
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(deny, member: member, terminal: true))
        let wrong = SettlementDecision(
            operationId: UUID(), approvalId: approvalId, settlement: settlement, approved: true)
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(wrong, member: member, terminal: true))
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).validated(member: foreign, approvalId: approvalId))
    }
}
