import Foundation
import XCTest

@testable import NestCore

final class MoneyCategoriesTests: XCTestCase {
    func testCategoryPagesRejectArchivedDuplicatesAndWrongScope() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let category = MoneyCategory(categoryId: UUID(), name: "Groceries", archived: false)
        func page(_ rows: [MoneyCategory], next: UUID? = nil) -> MoneyCategories {
            .init(version: 1, householdId: member.householdId, after: nil, next: next, categories: rows)
        }
        XCTAssertNoThrow(try page([category]).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([category, category]).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([category], next: category.id).validated(member: member, cursor: nil))
        XCTAssertThrowsError(try page([category]).validated(member: member, cursor: UUID()))
        XCTAssertThrowsError(
            try page([.init(categoryId: category.id, name: "Old", archived: true)]).validated(
                member: member, cursor: nil))
        let other = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Test")
        XCTAssertThrowsError(try page([category]).validated(member: other, cursor: nil))
        var draft = ExpenseDraft(payer: member.userId)
        draft.description = "Groceries"
        draft.amount = "1.01"
        draft.categoryId = category.id
        XCTAssertEqual(
            try draft.reviewed(member: member, members: [member.userId, UUID()], date: CivilDate("2026-09-28"))
                .categoryId, category.id)
    }
}
