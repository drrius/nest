import Foundation
import XCTest

@testable import NestCore

final class RecurringDraftTests: XCTestCase {
    func testFixedDraftBalancesAndVariableModeDropsAmounts() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let today = try CivilDate("2026-09-28")
        var draft = RecurringDraft(member: member, today: today)
        draft.description = "Bill"
        draft.mode = .fixed
        draft.scheduleDay = 28
        draft.amount = "1.01"
        draft.shares = [member.userId: "0.51", partner: "0.50"]
        let fixed = try draft.reviewed(member: member, members: [member.userId, partner], today: today)
        XCTAssertEqual(fixed.firstDueOn, today)
        XCTAssertEqual(fixed.configuration.amountCentimes?.value, 101)
        draft.shares[partner] = "0.51"
        XCTAssertThrowsError(try draft.reviewed(member: member, members: [member.userId, partner], today: today))
        draft.mode = .variable
        let variable = try draft.reviewed(member: member, members: [member.userId, partner], today: today)
        XCTAssertNil(variable.configuration.amountCentimes)
        XCTAssertNil(variable.configuration.allocations)
        draft.payer = UUID()
        XCTAssertThrowsError(try draft.reviewed(member: member, members: [member.userId, partner], today: today))
    }
}
