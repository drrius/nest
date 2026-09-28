import Foundation
import XCTest

@testable import NestCore

final class ExpenseDraftTests: XCTestCase {
    func testPercentageBelongsToDisplayedFirstMemberWhenSecondMemberPays() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let payer = UUID()
        var draft = ExpenseDraft(payer: payer)
        draft.description = " Groceries "
        draft.amount = "1.01"
        draft.split = .percentage
        draft.firstPercentage = "25"
        let input = try draft.reviewed(member: member, members: [member.userId, payer], date: CivilDate("2026-09-28"))
        XCTAssertEqual(input.allocations.first(where: { $0.memberId == member.userId })?.centimes.value, 25)
        XCTAssertEqual(input.allocations.first(where: { $0.memberId == payer })?.centimes.value, 76)
        XCTAssertEqual(input.description, "Groceries")
        draft.firstPercentage = "101"
        XCTAssertThrowsError(try draft.reviewed(member: member, members: [member.userId, payer], date: input.date))
        draft.split = .exact
        draft.firstExact = "0.50"
        draft.secondExact = "0.50"
        XCTAssertThrowsError(try draft.reviewed(member: member, members: [member.userId, payer], date: input.date))
        draft.secondExact = "0.51"
        draft.separateReceiptTotal = true
        draft.receiptTotal = "1.00"
        XCTAssertThrowsError(try draft.reviewed(member: member, members: [member.userId, payer], date: input.date))
        draft.receiptTotal = "2.00"
        XCTAssertEqual(
            try draft.reviewed(member: member, members: [member.userId, payer], date: input.date).receiptTotalCentimes?
                .value, 200)
    }
}
