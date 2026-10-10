import Foundation
import XCTest

@testable import NestCore

final class FinancialApprovalExpiryTests: XCTestCase {
    func testExpiryEvidenceMustMatchExactAccountAndDecision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approval = UUID()
        let operation = UUID()
        let evidence = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: approval, operationId: operation, command: .expense,
            expiredUnused: true, checkedAt: "2026-09-28T08:00:00.000000Z")
        XCTAssertTrue(
            try evidence.validated(
                member: member, approvalId: approval, operationId: operation, command: .expense
            ).expiredUnused)
        for account in [
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner"),
            VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other"),
        ] {
            XCTAssertThrowsError(
                try evidence.validated(
                    member: account, approvalId: approval, operationId: operation, command: .expense))
        }
        XCTAssertThrowsError(
            try evidence.validated(
                member: member, approvalId: UUID(), operationId: operation, command: .expense))
        XCTAssertThrowsError(
            try evidence.validated(
                member: member, approvalId: approval, operationId: UUID(), command: .expense))
        XCTAssertThrowsError(
            try evidence.validated(
                member: member, approvalId: approval, operationId: operation, command: .refund))
    }
}
