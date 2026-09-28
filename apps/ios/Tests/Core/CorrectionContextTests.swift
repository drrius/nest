import Foundation
import XCTest

@testable import NestCore

final class CorrectionContextTests: XCTestCase {
    func testCorrectionAvailabilityMatchesRefundAndReversalState() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let event = UUID()
        func context(reversed: Bool, refunds: Bool, reverse: Bool, replace: Bool) throws -> CorrectionContext {
            let summary = MoneyEventSummary(
                eventId: event, kind: .expense, occurredOn: "2026-09-28",
                createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1",
                description: "Fixture", amountCentimes: try Centimes("101"), createdBy: member.userId,
                payerId: member.userId, relatedEventId: nil, hasReceipt: false)
            let source = MoneyDetail(
                version: 1, householdId: member.householdId, event: summary,
                receiptTotalCentimes: nil, note: nil, category: nil, reversedById: reversed ? UUID() : nil,
                shares: [
                    .init(
                        memberId: member.userId, allocatedCentimes: try Centimes("51"),
                        deltaCentimes: try Centimes("50")),
                    .init(memberId: partner, allocatedCentimes: try Centimes("50"), deltaCentimes: try Centimes("-50")),
                ])
            return .init(
                version: 1, householdId: member.householdId, source: source, hasActiveRefunds: refunds,
                hasOpeningSuccessor: false, canReverse: reverse, canReplace: replace)
        }
        for reversed in [false, true] {
            for refunds in [false, true] {
                let allowed = !reversed && !refunds
                _ = try context(reversed: reversed, refunds: refunds, reverse: allowed, replace: allowed)
                    .validated(member: member, sourceEventId: event)
                XCTAssertThrowsError(
                    try context(reversed: reversed, refunds: refunds, reverse: !allowed, replace: allowed)
                        .validated(member: member, sourceEventId: event))
                XCTAssertThrowsError(
                    try context(reversed: reversed, refunds: refunds, reverse: allowed, replace: !allowed)
                        .validated(member: member, sourceEventId: event))
            }
        }
        XCTAssertThrowsError(
            try context(reversed: false, refunds: false, reverse: true, replace: true)
                .validated(member: member, sourceEventId: UUID()))
    }
}
