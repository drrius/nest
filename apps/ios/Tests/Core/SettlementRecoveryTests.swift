import Foundation
import XCTest

@testable import NestCore

final class SettlementRecoveryTests: XCTestCase {
    func testRecoveryBindsOperationAccountAndReviewedPayment() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let input = SettlementInput(
            description: "Settlement", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId,
            recipientId: UUID(), mode: .full, date: try CivilDate("2026-09-28"), note: nil)
        let command = SaveSettlement(operationId: UUID(), settlement: input)
        let receipt = SettlementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, eventId: UUID(), approvalId: nil, settlement: input)
        func result(_ status: SettlementRecovery.Status, receipt: SettlementReceipt?) -> SettlementRecovery {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, status: status, receipt: receipt)
        }
        _ = try result(.recorded, receipt: receipt).validated(member: member, command: command)
        for status in [SettlementRecovery.Status.unresolved, .cancelled] {
            _ = try result(status, receipt: nil).validated(member: member, command: command)
            XCTAssertThrowsError(try result(status, receipt: receipt).validated(member: member, command: command))
        }
        XCTAssertThrowsError(try result(.recorded, receipt: nil).validated(member: member, command: command))
        XCTAssertThrowsError(
            try result(.unresolved, receipt: nil).validated(member: member, command: command, cancellation: true))
        XCTAssertThrowsError(
            try receipt.validated(member: member, command: .init(operationId: UUID(), settlement: input)))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try receipt.validated(member: other, command: command))
        let changed = SettlementInput(
            description: input.description, amountCentimes: try Centimes("50"),
            expectedOutstandingCentimes: input.expectedOutstandingCentimes, payerId: input.payerId,
            recipientId: input.recipientId, mode: .partial, date: input.date, note: nil)
        XCTAssertThrowsError(
            try receipt.validated(member: member, command: .init(operationId: command.operationId, settlement: changed))
        )
    }
}
