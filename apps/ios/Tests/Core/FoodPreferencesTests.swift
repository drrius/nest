import Foundation
import XCTest

@testable import NestCore

final class FoodPreferencesTests: XCTestCase {
    func testOptionalGoalAndContractBounds() throws {
        let preferences = FoodPreferences(restrictions: ["Vegetarian"], dislikes: [], calorieGoal: nil, portions: 0.5)
        _ = try preferences.validated()
        let data = try JSONEncoder().encode(preferences)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(json["calorieGoal"] is NSNull)
        XCTAssertEqual(try JSONDecoder().decode(FoodPreferences.self, from: data), preferences)
        var invalid = preferences
        invalid.portions = 0.75
        XCTAssertThrowsError(try invalid.validated())
        invalid = preferences
        invalid.calorieGoal = 20001
        XCTAssertThrowsError(try invalid.validated())
        invalid = preferences
        invalid.restrictions = [String(repeating: "😀", count: 61)]
        XCTAssertThrowsError(try invalid.validated())
        invalid.restrictions = ["\u{FEFF}"]
        XCTAssertThrowsError(try invalid.validated())
        invalid.restrictions = Array(repeating: "A", count: 33)
        XCTAssertThrowsError(try invalid.validated())
    }

    func testPrivateProfileAndSaveReceiptCannotCrossActors() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let preferences = FoodPreferences(restrictions: [], dislikes: [], calorieGoal: 1800, portions: 1)
        let envelope = FoodProfileEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            profile: .init(revision: "1", preferences: preferences))
        _ = try envelope.validated(member: member)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try envelope.validated(member: partner))
        let command = SaveFoodPreferences(operationId: UUID(), expectedRevision: "1", preferences: preferences)
        let receipt = FoodPreferenceReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId, revision: "2")
        _ = try receipt.validated(member: member, command: command)
        XCTAssertThrowsError(try receipt.validated(member: partner, command: command))
        let wrong = SaveFoodPreferences(operationId: UUID(), expectedRevision: "1", preferences: preferences)
        XCTAssertThrowsError(try receipt.validated(member: member, command: wrong))
        let overflow = SaveFoodPreferences(
            operationId: UUID(), expectedRevision: String(Int64.max), preferences: preferences)
        XCTAssertThrowsError(try overflow.validated())
    }
}
