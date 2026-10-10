import Foundation
import XCTest

@testable import NestCore

final class MoneyBalanceTests: XCTestCase {
    func testExactCentimesRejectNoncanonicalOrRoundedValues() throws {
        for invalid in ["-0", "+1", "01", "1.0", " 1", "1e2", "9007199254740992", "-9007199254740992"] {
            XCTAssertThrowsError(try Centimes(invalid), invalid)
        }
        XCTAssertEqual(try Centimes("9007199254740991").absoluteCHF, "CHF 90071992547409.91")
        XCTAssertEqual(try Centimes("-1").absoluteCHF, "CHF 0.01")
        XCTAssertThrowsError(try JSONDecoder().decode(Centimes.self, from: Data("100".utf8)))
        for amount in stride(from: Int64(-100_000), through: 100_000, by: 997) {
            let value = try Centimes(String(amount))
            XCTAssertEqual(try JSONDecoder().decode(Centimes.self, from: JSONEncoder().encode(value)), value)
        }
    }

    func testBalanceRequiresHouseholdMembershipAndConservation() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        func balance(_ amount: Int64, other: Int64, count: String = "1") throws -> MoneyBalance {
            MoneyBalance(
                version: 1, householdId: member.householdId, eventCount: count, openingEstablished: false,
                members: [
                    .init(actorId: member.userId, displayName: "Test", centimes: try Centimes(String(amount))),
                    .init(actorId: partner, displayName: "Partner", centimes: try Centimes(String(other))),
                ])
        }
        for amount in stride(from: Int64(-10_000), through: 10_000, by: 101) {
            XCTAssertNoThrow(try balance(amount, other: -amount).validated(member: member))
            XCTAssertThrowsError(try balance(amount, other: -amount + 1).validated(member: member))
        }
        XCTAssertNoThrow(try balance(0, other: 0, count: "0").validated(member: member))
        XCTAssertThrowsError(try balance(1, other: -1, count: "0").validated(member: member))
        XCTAssertThrowsError(try balance(0, other: 0, count: "01").validated(member: member))
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Outsider")
        XCTAssertThrowsError(try balance(0, other: 0).validated(member: outsider))
        let moved = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Test")
        XCTAssertThrowsError(try balance(0, other: 0).validated(member: moved))
    }
}
