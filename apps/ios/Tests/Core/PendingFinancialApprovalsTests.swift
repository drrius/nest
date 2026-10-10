import Foundation
import XCTest

@testable import NestCore

final class PendingFinancialApprovalsTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(), householdId: UUID(), displayName: "Test")

    func testPrivatePageRejectsOtherActorHouseholdAndRepeatedCursor() throws {
        let id = UUID(uuidString: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!
        let row = PendingFinancialApproval(
            approvalId: id, command: .expense, expiresAt: "2099-01-01T12:00:00.000000Z")
        func page(actor: UUID, household: UUID) -> PendingFinancialApprovals {
            .init(version: 1, householdId: household, actorId: actor, approvals: [row], next: nil)
        }
        let valid = page(actor: member.userId, household: member.householdId)
        XCTAssertNoThrow(try valid.validated(member: member, after: nil))
        XCTAssertThrowsError(try valid.validated(member: member, after: id))
        XCTAssertThrowsError(
            try page(actor: UUID(), household: member.householdId).validated(member: member, after: nil))
        XCTAssertThrowsError(
            try page(actor: member.userId, household: UUID()).validated(member: member, after: nil))
    }

    func testInvalidExpiryAndInventedPaginationAreRejected() {
        let row = PendingFinancialApproval(approvalId: UUID(), command: .refund, expiresAt: "unknown")
        let invalidDate = PendingFinancialApprovals(
            version: 1, householdId: member.householdId, actorId: member.userId,
            approvals: [row], next: nil)
        XCTAssertThrowsError(try invalidDate.validated(member: member, after: nil))
        let invalidCursor = PendingFinancialApprovals(
            version: 1, householdId: member.householdId, actorId: member.userId,
            approvals: [], next: UUID())
        XCTAssertThrowsError(try invalidCursor.validated(member: member, after: nil))
    }

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
