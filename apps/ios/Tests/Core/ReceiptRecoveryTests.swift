import Foundation
import XCTest

@testable import NestCore

final class ReceiptRecoveryTests: XCTestCase {
    func testRecoveryRejectsForeignScopeDuplicateRowsAndFalsePagination() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let input = ReceiptUploadInput(
            uploadId: UUID(), sha256: String(repeating: "0", count: 64), bytes: 12, contentType: "application/pdf")
        let row = ReceiptRecovery.Upload(
            uploadId: input.uploadId, sha256: input.sha256, bytes: input.bytes, contentType: input.contentType,
            path: input.path(household: member.householdId), status: .pending, stored: true,
            createdAt: "2026-09-28T00:00:00.000000Z")
        func page(rows: [ReceiptRecovery.Upload], next: UUID? = nil) -> ReceiptRecovery {
            .init(
                version: 1, householdId: member.householdId, uploaderId: member.userId,
                after: nil, next: next, uploads: rows)
        }
        _ = try page(rows: [row]).validated(member: member, after: nil)
        XCTAssertThrowsError(try page(rows: [row, row]).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(rows: [row], next: row.uploadId).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(rows: [row]).validated(member: member, after: row.uploadId))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try page(rows: [row]).validated(member: partner, after: nil))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try page(rows: [row]).validated(member: foreign, after: nil))
    }

    func testCleanupPreservesServerOutcomeAndBindsObject() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let input = ReceiptUploadInput(
            uploadId: UUID(), sha256: String(repeating: "0", count: 64), bytes: 12, contentType: "image/jpeg")
        for status in [ReceiptCleanup.Status.claimed, .deleting, .deleted] {
            let result = ReceiptCleanup(
                version: 1, householdId: member.householdId, uploadId: input.uploadId,
                path: input.path(household: member.householdId), status: status)
            XCTAssertEqual(try result.validated(member: member, input: input).status, status)
            let changed = ReceiptUploadInput(
                uploadId: UUID(), sha256: input.sha256, bytes: 12, contentType: input.contentType)
            XCTAssertThrowsError(try result.validated(member: member, input: changed))
        }
    }
}
