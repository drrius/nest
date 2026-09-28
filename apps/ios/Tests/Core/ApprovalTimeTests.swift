import Foundation
import XCTest

@testable import NestCore

final class ApprovalTimeTests: XCTestCase {
    func testFiniteDeadlineAndExactExpiryBoundary() throws {
        let value = "2026-09-28T10:00:00.000000Z"
        let deadline = try XCTUnwrap(ApprovalTime.date(value))
        XCTAssertTrue(ApprovalTime.isOpen(value, now: deadline.addingTimeInterval(-1)))
        XCTAssertFalse(ApprovalTime.isOpen(value, now: deadline))
        XCTAssertFalse(ApprovalTime.isOpen(value, now: deadline.addingTimeInterval(1)))
        for invalid in ["infinity", "-infinity", "12026-09-28T10:00:00.000000Z", "2026-02-30T10:00:00.000000Z"] {
            XCTAssertNil(ApprovalTime.date(invalid))
        }
    }
}
