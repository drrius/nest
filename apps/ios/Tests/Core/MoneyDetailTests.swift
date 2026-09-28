import Foundation
import XCTest

@testable import NestCore

final class MoneyDetailTests: XCTestCase {
    func testExpenseAndRefundAllocationConservation() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        for kind in [MoneyEventSummary.Kind.expense, .refund] {
            for amount in stride(from: Int64(1), through: 1000, by: 37) {
                let payerShare = amount / 2
                let delta = (amount - payerShare) * (kind == .refund ? -1 : 1)
                let event = MoneyEventSummary(
                    eventId: UUID(), kind: kind, occurredOn: "2026-09-28", createdAt: "2026-09-28T00:00:00.000000Z",
                    occurredOrder: "1", createdOrder: "1", description: "Fixture",
                    amountCentimes: try Centimes(String(amount)),
                    createdBy: member.userId, payerId: member.userId, relatedEventId: kind == .refund ? UUID() : nil,
                    hasReceipt: false)
                func detail(_ adjustment: Int64) throws -> MoneyDetail {
                    MoneyDetail(
                        version: 1, householdId: member.householdId, event: event, receiptTotalCentimes: nil,
                        note: nil, category: nil, reversedById: nil,
                        shares: [
                            .init(
                                memberId: member.userId, allocatedCentimes: try Centimes(String(payerShare)),
                                deltaCentimes: try Centimes(String(delta + adjustment))),
                            .init(
                                memberId: partner, allocatedCentimes: try Centimes(String(amount - payerShare)),
                                deltaCentimes: try Centimes(String(-delta - adjustment))),
                        ])
                }
                XCTAssertNoThrow(try detail(0).validated(member: member, eventId: event.id))
                XCTAssertThrowsError(try detail(1).validated(member: member, eventId: event.id))
                XCTAssertThrowsError(try detail(0).validated(member: member, eventId: UUID()))
            }
        }
    }
}
