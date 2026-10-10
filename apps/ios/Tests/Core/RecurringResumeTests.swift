import Foundation
import XCTest

@testable import NestCore

final class RecurringResumeTests: XCTestCase {
    func testResumeReceiptRejectsCoveredCycleAndUnchangedRevision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let configuration = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-09-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let input = RecurringResumeInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: "paused",
            action: "resume", resumeFrom: try CivilDate("2026-09-28"), firstDueOn: try CivilDate("2026-10-28"))
        let command = SaveRecurringResume(operationId: UUID(), change: input)
        func receipt(_ revision: UUID, covered: CivilDate?) -> RecurringResumeReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, revision: revision, status: .active,
                change: input, configuration: configuration, coveredThrough: covered)
        }
        _ = try receipt(UUID(), covered: CivilDate("2026-09-30")).validated(member: member, command: command)
        XCTAssertThrowsError(
            try receipt(input.expectedRevision, covered: CivilDate("2026-09-30")).validated(
                member: member, command: command))
        XCTAssertThrowsError(
            try receipt(UUID(), covered: CivilDate("2026-10-31")).validated(member: member, command: command))
        XCTAssertThrowsError(try receipt(UUID(), covered: nil).validated(member: member, command: command))
    }
}
