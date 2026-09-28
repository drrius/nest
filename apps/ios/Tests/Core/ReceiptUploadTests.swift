import Foundation
import XCTest

@testable import NestCore

final class ReceiptUploadTests: XCTestCase {
    func testReservationBindsExactFileAndUploader() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let input = ReceiptUploadInput(
            uploadId: UUID(), sha256: String(repeating: "a", count: 64), bytes: 12, contentType: "image/jpeg")
        func reservation(stored: Bool = true, path: String? = nil) -> ReceiptUploadReservation {
            .init(
                version: 1, householdId: member.householdId, uploaderId: member.userId,
                uploadId: input.uploadId, sha256: input.sha256, bytes: input.bytes,
                contentType: input.contentType, path: path ?? input.path(household: member.householdId), stored: stored)
        }
        _ = try reservation().validated(member: member, input: input, requireStored: true)
        _ = try reservation(stored: false).validated(member: member, input: input, requireStored: false)
        XCTAssertThrowsError(
            try reservation(stored: false).validated(member: member, input: input, requireStored: true))
        for other in [
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner"),
            VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other"),
        ] {
            XCTAssertThrowsError(try reservation().validated(member: other, input: input, requireStored: true))
        }
        let changed = ReceiptUploadInput(
            uploadId: input.uploadId, sha256: String(repeating: "b", count: 64), bytes: 12, contentType: "image/jpeg")
        XCTAssertThrowsError(try reservation().validated(member: member, input: changed, requireStored: true))
        for path in [input.path(household: member.householdId).uppercased(), "../receipt.jpg"] {
            XCTAssertThrowsError(
                try reservation(path: path).validated(member: member, input: input, requireStored: true))
        }
    }

    func testUploadBoundariesAndNewMediaRestrictions() throws {
        for size in [12, 4_194_304] {
            for type in ["image/jpeg", "application/pdf"] {
                _ = try ReceiptUploadInput(
                    uploadId: UUID(), sha256: String(repeating: "0", count: 64), bytes: size, contentType: type
                ).validated()
            }
        }
        for (size, type, hash) in [
            (11, "image/jpeg", String(repeating: "0", count: 64)),
            (4_194_305, "application/pdf", String(repeating: "0", count: 64)),
            (12, "image/png", String(repeating: "0", count: 64)),
            (12, "image/jpeg", String(repeating: "A", count: 64)),
            (12, "image/jpeg", String(repeating: "0", count: 64) + "\n"),
        ] {
            XCTAssertThrowsError(
                try ReceiptUploadInput(uploadId: UUID(), sha256: hash, bytes: size, contentType: type).validated())
        }
    }
}
