import Foundation
import XCTest

@testable import NestCore

final class VariableCycleDraftTests: XCTestCase {
    func testOnlyDueActiveBillsWithExactHouseholdSharesCanBeReviewed() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let day = try CivilDate("2026-09-28")
        let config = RecurringConfiguration(
            description: "Bill", payerId: member.userId,
            categoryId: nil, note: nil, startDate: day,
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28), mode: .variable,
            amountCentimes: nil, allocations: nil)
        func detail(_ status: RecurringRule.Status, today: CivilDate) -> RecurringDetail {
            .init(
                version: 1, householdId: member.householdId, today: today,
                rule: .init(
                    ruleId: UUID(), revision: UUID(), configuration: config, status: status,
                    authorizedBy: member.userId, authorizedAt: "2026-09-28T00:00:00Z",
                    coveredThrough: nil, nextDueOn: day))
        }
        var draft = VariableCycleDraft(amount: "1.01", shares: [member.userId: "0.51", partner: "0.50"])
        let due = detail(.active, today: day)
        let input = try draft.reviewed(detail: due, member: member, members: [member.userId, partner])
        XCTAssertEqual(input.expectedRevision, due.rule.revision)
        XCTAssertEqual(input.dueOn, day)
        for status in [RecurringRule.Status.paused, .cancelled] {
            XCTAssertThrowsError(
                try draft.reviewed(
                    detail: detail(status, today: day), member: member,
                    members: [member.userId, partner]))
        }
        XCTAssertThrowsError(
            try draft.reviewed(
                detail: detail(.active, today: CivilDate("2026-09-27")),
                member: member, members: [member.userId, partner]))
        XCTAssertThrowsError(try draft.reviewed(detail: due, member: member, members: [partner, UUID()]))
        draft.shares[partner] = "0.51"
        XCTAssertThrowsError(try draft.reviewed(detail: due, member: member, members: [member.userId, partner]))
    }
}
