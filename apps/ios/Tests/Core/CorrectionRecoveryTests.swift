import Foundation
import XCTest

@testable import NestCore

final class CorrectionRecoveryTests: XCTestCase {
    func testRecoveryRejectsCrossAccountAndContradictoryOutcomes() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = SaveCorrection(
            operationId: UUID(),
            correction: .init(sourceEventId: UUID(), expectedReversalId: nil, replacement: nil))
        let receipt = CorrectionReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, approvalId: nil, reversalEventId: UUID(),
            replacementEventId: nil, correction: command.correction)
        func result(_ status: CorrectionRecovery.Status, _ value: CorrectionReceipt?) -> CorrectionRecovery {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, status: status, receipt: value)
        }
        _ = try result(.recorded, receipt).validated(member: member, command: command)
        for status in [CorrectionRecovery.Status.unresolved, .cancelled] {
            _ = try result(status, nil).validated(member: member, command: command)
            XCTAssertThrowsError(try result(status, receipt).validated(member: member, command: command))
        }
        XCTAssertThrowsError(try result(.recorded, nil).validated(member: member, command: command))
        XCTAssertThrowsError(
            try result(.unresolved, nil).validated(member: member, command: command, cancellation: true))
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try result(.recorded, receipt).validated(member: outsider, command: command))
        XCTAssertThrowsError(
            try result(.recorded, receipt).validated(
                member: member, command: .init(operationId: UUID(), correction: command.correction)))
    }
}
