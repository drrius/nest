import Foundation
import XCTest

@testable import NestCore

final class SettlementCommandTests: XCTestCase {
    func testSettlementDirectionAndFullAmountAcrossFinancialRange() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let date = try CivilDate("2026-09-28")
        for amount in [Int64(1), 2, 101, 9999, 9_007_199_254_740_991] {
            for sign in [Int64(-1), 1] {
                let balance = MoneyBalance(
                    version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: true,
                    members: [
                        .init(
                            actorId: member.userId, displayName: "Alex", centimes: try Centimes(String(amount * sign))),
                        .init(actorId: partner, displayName: "Sam", centimes: try Centimes(String(-amount * sign))),
                    ])
                let input = try SettlementDraft().reviewed(balance: balance, member: member, date: date)
                XCTAssertEqual(input.payerId, sign < 0 ? member.userId : partner)
                XCTAssertEqual(input.recipientId, sign < 0 ? partner : member.userId)
                XCTAssertEqual(input.amountCentimes.value, amount)
                XCTAssertEqual(input.expectedOutstandingCentimes, input.amountCentimes)
                let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as! [String: Any]
                XCTAssertTrue(encoded["note"] is NSNull)
            }
        }
    }

    func testPartialSettlementRejectsZeroAndOverpayment() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let balance = MoneyBalance(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: true,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("-101")),
                .init(actorId: UUID(), displayName: "Sam", centimes: try Centimes("101")),
            ])
        var draft = SettlementDraft(mode: .partial, amount: "0.50")
        let date = try CivilDate("2026-09-28")
        XCTAssertEqual(try draft.reviewed(balance: balance, member: member, date: date).amountCentimes.value, 50)
        for value in ["0", "1.02", "-1", "NaN"] {
            draft.amount = value
            XCTAssertThrowsError(try draft.reviewed(balance: balance, member: member, date: date))
        }
    }
}
