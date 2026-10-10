import Foundation
import XCTest

@testable import NestCore

final class CorrectionApprovalTests: XCTestCase {
    func testConsumedApprovalRequiresExactBoundReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approvalId = UUID()
        let operation = UUID()
        let correction = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: nil)
        func envelope(_ status: CorrectionApproval.Status, receipt: CorrectionReceipt?) -> CorrectionApprovalEnvelope {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approvalId, operationId: operation, correction: correction, status: status,
                    expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let receipt = CorrectionReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: operation, approvalId: approvalId, reversalEventId: UUID(), replacementEventId: nil,
            correction: correction)
        _ = try envelope(.consumed, receipt: receipt).validated(member: member, approvalId: approvalId)
        _ = try envelope(.pending, receipt: nil).validated(member: member, approvalId: approvalId)
        XCTAssertThrowsError(try envelope(.consumed, receipt: nil).validated(member: member, approvalId: approvalId))
        XCTAssertThrowsError(try envelope(.pending, receipt: receipt).validated(member: member, approvalId: approvalId))
        let unrelated = CorrectionReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(), approvalId: approvalId, reversalEventId: UUID(), replacementEventId: nil,
            correction: correction)
        XCTAssertThrowsError(
            try envelope(.consumed, receipt: unrelated).validated(member: member, approvalId: approvalId))
        let accept = CorrectionDecision(
            operationId: operation, approvalId: approvalId, correction: correction, approved: true)
        let deny = CorrectionDecision(
            operationId: operation, approvalId: approvalId, correction: correction, approved: false)
        _ = try envelope(.consumed, receipt: receipt).matching(accept, member: member, terminal: true)
        _ = try envelope(.denied, receipt: nil).matching(deny, member: member, terminal: true)
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).matching(accept, member: member, terminal: true))
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(deny, member: member, terminal: true))
        let wrong = CorrectionDecision(
            operationId: UUID(), approvalId: approvalId, correction: correction, approved: true)
        XCTAssertThrowsError(try envelope(.consumed, receipt: receipt).matching(wrong, member: member, terminal: true))
        let foreign = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try envelope(.pending, receipt: nil).validated(member: foreign, approvalId: approvalId))
    }
}
