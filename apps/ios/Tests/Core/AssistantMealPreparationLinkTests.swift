import Foundation
import XCTest

@testable import NestCore

final class AssistantMealPreparationLinkTests: XCTestCase {
    func testOnlySuccessfulOwnScopeReceiptsOpenFreshPreparation() throws {
        let fixture = try MealPreparationFixture()
        let value = try JSONDecoder().decode(
            AssistantJSON.self,
            from: JSONSerialization.data(withJSONObject: fixture.object["editReceipt"]!))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-editMealPreparation"),
            "state": .string("output-available"), "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertNotNil(AssistantMealPreparationLink.receipt(part, member: fixture.member))
        let foreign = VerifiedMember(userId: UUID(), householdId: fixture.member.householdId, displayName: "Other")
        XCTAssertNil(AssistantMealPreparationLink.receipt(part, member: foreign))
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantMealPreparationLink.receipt(part, member: fixture.member))
        part["state"] = .string("output-available")
        part["type"] = .string("tool-createMealPreparation")
        XCTAssertNil(AssistantMealPreparationLink.receipt(part, member: fixture.member))
        part["type"] = .string("tool-editMealPreparation")
        part["output"] = .object(["ok": .bool(false), "value": value])
        XCTAssertNil(AssistantMealPreparationLink.receipt(part, member: fixture.member))
    }
}
