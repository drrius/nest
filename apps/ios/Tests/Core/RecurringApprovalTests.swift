import Foundation
import XCTest

@testable import NestCore

final class RecurringApprovalTests: XCTestCase {
    func testApprovalBindsRuleReceiptAndDecision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let rule = RecurringInput(
            ruleId: UUID(), expectedRevision: nil,
            configuration: .init(
                description: "Bill", payerId: member.userId, categoryId: nil,
                note: nil, startDate: try CivilDate("2026-09-01"),
                schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
                mode: .variable, amountCentimes: nil, allocations: nil), firstDueOn: try CivilDate("2026-09-28"))
        let decision = RecurringDecision(operationId: UUID(), approvalId: UUID(), rule: rule, approved: true)
        func envelope(_ receipt: RecurringReceipt?) -> RecurringApprovalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: decision.approvalId, operationId: decision.operationId,
                    rule: rule, status: .consumed, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let receipt = RecurringReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: decision.operationId, approvalId: decision.approvalId, revision: UUID(), status: .active,
            rule: rule)
        _ = try envelope(receipt).matching(decision, member: member, terminal: true)
        XCTAssertThrowsError(try envelope(nil).matching(decision, member: member, terminal: true))
        let denied = RecurringDecision(
            operationId: decision.operationId, approvalId: decision.approvalId, rule: rule, approved: false)
        XCTAssertThrowsError(try envelope(receipt).matching(denied, member: member, terminal: true))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try envelope(receipt).matching(decision, member: other, terminal: true))
    }
}
