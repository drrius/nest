import Foundation
import XCTest

@testable import NestCore

final class CookingPreferencesTests: XCTestCase {
    func testSlotSelectionRequiresUniqueNonemptySetAndRevisionCapacity() throws {
        let invalid: [[MealSlot]] = [[], [.dinner, .dinner]]
        for slots in invalid {
            XCTAssertThrowsError(
                try SaveCookingProfile(operationId: UUID(), expectedRevision: "1", notes: "", slots: slots))
        }
        XCTAssertThrowsError(
            try SaveCookingProfile(operationId: UUID(), expectedRevision: String(Int64.max), notes: "", slots: [.lunch])
        )
        let value = try SaveCookingProfile(
            operationId: UUID(), expectedRevision: "0", notes: "Quick dinners", slots: [.dinner])
        XCTAssertEqual(value.preferences.cookingNotes, "Quick dinners")
        XCTAssertEqual(value.preferences.mealSlots, [.dinner])
    }

    func testNotesUseServerUTF16LimitAndReceiptIsAccountBound() throws {
        XCTAssertThrowsError(
            try SaveCookingProfile(
                operationId: UUID(), expectedRevision: "0",
                notes: String(repeating: "🥣", count: 1001), slots: [.dinner]))
        let command = try SaveCookingProfile(operationId: UUID(), expectedRevision: "4", notes: "", slots: [.lunch])
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let receipt = CookingSaveReceipt(
            actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, revision: "5")
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try receipt.validated(member: other, command: command))
    }
}
