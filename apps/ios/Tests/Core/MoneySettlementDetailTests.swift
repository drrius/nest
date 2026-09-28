import Foundation
import XCTest

@testable import NestCore

final class MoneySettlementDetailTests: XCTestCase {
    func testSettlementAndReversalRequireCorrectShares() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        for kind in [MoneyEventSummary.Kind.settlement, .openingBalance, .reversal] {
            let event = MoneyEventSummary(
                eventId: UUID(), kind: kind, occurredOn: "2026-09-28", createdAt: "2026-09-28T00:00:00.000000Z",
                occurredOrder: "1", createdOrder: "1", description: "Fixture", amountCentimes: try Centimes("101"),
                createdBy: member.userId, payerId: kind == .reversal ? nil : member.userId,
                relatedEventId: kind == .reversal ? UUID() : nil, hasReceipt: false)
            func detail(allocation: Centimes? = nil, delta: String = "101", reversed: UUID? = nil) throws -> MoneyDetail
            {
                MoneyDetail(
                    version: 1, householdId: member.householdId, event: event, receiptTotalCentimes: nil,
                    note: nil, category: nil, reversedById: reversed,
                    shares: [
                        .init(
                            memberId: member.userId, allocatedCentimes: allocation, deltaCentimes: try Centimes(delta)),
                        .init(
                            memberId: partner, allocatedCentimes: allocation,
                            deltaCentimes: try Centimes(String(-Int64(delta)!))),
                    ])
            }
            XCTAssertNoThrow(try detail().validated(member: member, eventId: event.id))
            XCTAssertThrowsError(try detail(allocation: Centimes("0")).validated(member: member, eventId: event.id))
            XCTAssertThrowsError(try detail(reversed: event.id).validated(member: member, eventId: event.id))
            if kind == .reversal {
                XCTAssertThrowsError(try detail(reversed: UUID()).validated(member: member, eventId: event.id))
            } else {
                XCTAssertThrowsError(try detail(delta: "100").validated(member: member, eventId: event.id))
            }
        }
    }
}
