import Foundation
import XCTest

@testable import NestCore

final class RefundCommandTests: XCTestCase {
    func testRefundConservesTotalAndCannotExceedEitherRemainingShare() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        for cap in [Int64(1), 51, 10000, 4_503_599_627_370_495] {
            func input(first: Int64, second: Int64) throws -> RefundInput {
                .init(
                    sourceEventId: UUID(), description: "Refund", amountCentimes: try Centimes(String(first + second)),
                    payerId: member.userId,
                    allocations: [
                        .init(memberId: member.userId, centimes: try Centimes(String(first))),
                        .init(memberId: partner, centimes: try Centimes(String(second))),
                    ],
                    expectedRemaining: [
                        .init(memberId: member.userId, centimes: try Centimes(String(cap))),
                        .init(memberId: partner, centimes: try Centimes(String(cap))),
                    ],
                    date: try CivilDate("2026-09-28"), note: nil)
            }
            _ = try input(first: cap, second: cap).validated(member: member)
            _ = try input(first: 0, second: cap).validated(member: member)
            XCTAssertThrowsError(try input(first: cap + 1, second: 0).validated(member: member))
            XCTAssertThrowsError(try input(first: 0, second: cap + 1).validated(member: member))
            XCTAssertThrowsError(try input(first: 0, second: 0).validated(member: member))
            let outside = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
            XCTAssertThrowsError(try input(first: cap, second: 0).validated(member: outside))
        }
    }
}
