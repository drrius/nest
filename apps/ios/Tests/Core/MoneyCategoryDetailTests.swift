import Foundation
import XCTest

@testable import NestCore

final class MoneyCategoryDetailTests: XCTestCase {
    func testArchivedCategoryIsReadableButMustMatchHouseholdAndIdentity() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let id = UUID()
        let archived = MoneyCategory(categoryId: id, name: "Retained category", archived: true)
        let result = MoneyCategoryEnvelope(
            version: 1, householdId: member.householdId, categoryId: id, category: archived)
        XCTAssertTrue(try result.validated(member: member, categoryId: id).category!.archived)
        XCTAssertThrowsError(try result.validated(member: member, categoryId: UUID()))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try result.validated(member: foreign, categoryId: id))
        let missing = MoneyCategoryEnvelope(version: 1, householdId: member.householdId, categoryId: id, category: nil)
        XCTAssertNil(try missing.validated(member: member, categoryId: id).category)
    }
}
