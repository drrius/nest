import Foundation
import XCTest

@testable import NestCore

final class MoneyHistoryTests: XCTestCase {
    func testHistoryRejectsWrongHouseholdCursorDuplicateAndOrdering() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        func event(_ order: String) throws -> MoneyEventSummary {
            MoneyEventSummary(
                eventId: UUID(), kind: .expense, occurredOn: "2026-09-28",
                createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: order, createdOrder: order,
                description: "Test expense", amountCentimes: try Centimes("101"), createdBy: member.userId,
                payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        }
        let newer = try event("99999999999999999999")
        let older = try event("9007199254740993")
        func page(_ events: [MoneyEventSummary], next: UUID? = nil) -> MoneyHistory {
            MoneyHistory(version: 1, householdId: member.householdId, before: nil, next: next, events: events)
        }
        XCTAssertNoThrow(try page([newer, older]).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([older, newer]).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([newer, newer]).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([newer], next: newer.id).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([newer]).validated(member: member, cursor: UUID()))
        let other = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try page([newer]).validated(member: other, cursor: nil))
    }
}
