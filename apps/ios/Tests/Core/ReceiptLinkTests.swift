import Foundation
import XCTest

@testable import NestCore

final class ReceiptLinkTests: XCTestCase {
    func testReceiptLinksBindOriginObjectAccountAndExpiry() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let event = UUID()
        let path = "\(member.householdId.uuidString)/receipts/\(UUID().uuidString).PDF"
        let metadata = ReceiptMetadata(
            version: 1, householdId: member.householdId, target: .init(eventId: event),
            receipt: .init(path: path, contentType: "application/pdf", bytes: try Centimes("100")))
        let origin = URL(string: "https://storage.example")!
        let valid = "https://storage.example/storage/v1/object/sign/household-files/\(path)?token=abc.def-123"
        let now = try BusyCapture.timestamp("2026-09-28T00:00:00Z")
        func link(_ url: String, expiry: String = "2026-09-28T00:01:00Z") -> ReceiptLink {
            .init(metadata: metadata, url: url, expiresAt: expiry)
        }
        XCTAssertEqual(
            try link(valid).validated(member: member, eventId: event, origin: origin, now: now).path,
            "/storage/v1/object/sign/household-files/\(path)")
        for invalid in [
            valid.replacingOccurrences(of: "storage.example", with: "evil.example"),
            valid.replacingOccurrences(of: "https:", with: "http:"), valid + "&download=1",
            valid + "#fragment", valid.replacingOccurrences(of: "https://", with: "https://user@"),
            valid.replacingOccurrences(of: path, with: path.lowercased()),
        ] {
            XCTAssertThrowsError(try link(invalid).validated(member: member, eventId: event, origin: origin, now: now))
        }
        XCTAssertThrowsError(
            try link(valid, expiry: "2026-09-28T00:00:00Z").validated(
                member: member, eventId: event, origin: origin, now: now))
        XCTAssertThrowsError(try link(valid).validated(member: member, eventId: UUID(), origin: origin, now: now))
        let other = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try link(valid).validated(member: other, eventId: event, origin: origin, now: now))
    }
}
