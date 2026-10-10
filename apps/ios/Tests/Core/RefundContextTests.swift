import Foundation
import XCTest

@testable import NestCore

final class RefundContextTests: XCTestCase {
    func testRefundableStateAndCapsMatchOriginalExpense() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let event = UUID()
        let summary = MoneyEventSummary(
            eventId: event, kind: .expense, occurredOn: "2026-09-28",
            createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1",
            description: "Fixture", amountCentimes: try Centimes("101"), createdBy: member.userId,
            payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        let detail = MoneyDetail(
            version: 1, householdId: member.householdId, event: summary,
            receiptTotalCentimes: nil, note: nil, category: nil, reversedById: nil,
            shares: [
                .init(
                    memberId: member.userId, allocatedCentimes: try Centimes("51"), deltaCentimes: try Centimes("50")),
                .init(memberId: partner, allocatedCentimes: try Centimes("50"), deltaCentimes: try Centimes("-50")),
            ])
        func context(_ first: Int, _ second: Int, refundable: Bool) throws -> RefundContext {
            .init(
                version: 1, householdId: member.householdId, source: detail,
                remaining: [
                    .init(memberId: member.userId, centimes: try Centimes(String(first))),
                    .init(memberId: partner, centimes: try Centimes(String(second))),
                ], refundable: refundable)
        }
        _ = try context(51, 50, refundable: true).validated(member: member, sourceEventId: event)
        _ = try context(0, 0, refundable: false).validated(member: member, sourceEventId: event)
        for (first, second, flag) in [(52, 50, true), (51, 51, true), (-1, 50, true), (0, 0, true), (1, 0, false)] {
            XCTAssertThrowsError(
                try context(first, second, refundable: flag).validated(member: member, sourceEventId: event))
        }
        XCTAssertThrowsError(try context(51, 50, refundable: true).validated(member: member, sourceEventId: UUID()))
        for index in 0..<128 {
            let first = index % 51 + 1
            let second = index % 51
            let current = try context(first, second, refundable: true)
            let input = RefundInput(
                sourceEventId: event, description: "Refund", amountCentimes: try Centimes(String(first + second)),
                payerId: member.userId, allocations: current.remaining,
                expectedRemaining: Array(current.remaining.reversed()), date: try CivilDate("2026-10-01"), note: nil)
            _ = try input.validated(member: member, context: current)
            let changed = try context(first == 51 ? 50 : first + 1, second, refundable: true)
            XCTAssertThrowsError(try input.validated(member: member, context: changed))
            XCTAssertThrowsError(try input.validated(member: member, context: context(0, 0, refundable: false)))
        }
    }
}
