import Foundation
import XCTest

@testable import NestCore

final class RecurringReadTests: XCTestCase {
    func testDueBillsRejectCoveredPausedFutureAndDuplicateRules() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let today = try CivilDate("2026-09-28")
        let configuration = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-09-01"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28), mode: .variable,
            amountCentimes: nil, allocations: nil)
        func rule(_ status: RecurringRule.Status, due: String, covered: String?) throws -> RecurringRule {
            .init(
                ruleId: UUID(), revision: UUID(), configuration: configuration, status: status,
                authorizedBy: member.userId, authorizedAt: "2026-09-01T00:00:00.000000Z",
                coveredThrough: try covered.map(CivilDate.init), nextDueOn: try CivilDate(due))
        }
        func list(_ rules: [RecurringRule]) -> RecurringList {
            .init(version: 1, householdId: member.householdId, today: today, after: nil, next: nil, rules: rules)
        }
        let due = try rule(.active, due: "2026-09-28", covered: nil)
        _ = try list([due]).validated(member: member, cursor: nil, dueOnly: true)
        XCTAssertThrowsError(try list([due, due]).validated(member: member, cursor: nil))
        for invalid in [
            try rule(.paused, due: "2026-09-28", covered: nil),
            try rule(.active, due: "2026-09-29", covered: nil),
            try rule(.active, due: "2026-09-28", covered: "2026-09-28"),
            try rule(.active, due: "2026-08-28", covered: nil),
        ] {
            XCTAssertThrowsError(try list([invalid]).validated(member: member, cursor: nil, dueOnly: true))
        }
        XCTAssertFalse(RecurringSchedule(kind: .weekly, weekday: 8, dayOfMonth: nil).valid)
        XCTAssertFalse(RecurringSchedule(kind: .monthly, weekday: 1, dayOfMonth: 28).valid)
    }
}
