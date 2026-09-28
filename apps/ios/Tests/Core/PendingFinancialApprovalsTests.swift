import Foundation
import XCTest

@testable import NestCore

final class PendingFinancialApprovalsTests: XCTestCase {
    func testPrivateInboxRejectsForeignScopeDuplicateAndInvalidCursor() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let row = PendingFinancialApproval(
            approvalId: UUID(), command: .expense,
            expiresAt: "2026-09-28T09:00:00.000000Z")
        func page(actor: UUID, rows: [PendingFinancialApproval], next: UUID? = nil) -> PendingFinancialApprovals {
            .init(version: 1, householdId: member.householdId, actorId: actor, approvals: rows, next: next)
        }
        _ = try page(actor: member.userId, rows: [row]).validated(member: member, after: nil)
        XCTAssertThrowsError(try page(actor: UUID(), rows: [row]).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row, row]).validated(member: member, after: nil))
        XCTAssertThrowsError(
            try page(actor: member.userId, rows: [row], next: row.id).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row]).validated(member: member, after: row.id))
        let otherHousehold = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row]).validated(member: otherHousehold, after: nil))
    }
}
