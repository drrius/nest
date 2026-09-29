import XCTest

@testable import NestCore

final class GroceryReminderTests: XCTestCase {
    func testExactDateVersionAndConsentRequiredForReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let settings = DatedReminderSettings(
            enabled: true, recipientIds: [member.userId],
            localDate: try CivilDate("2028-03-01"), localTime: "08:00")
        let command = SaveGroceryReminder(
            operationId: UUID(), itemId: UUID(), expectedItemVersion: "9223372036854775807",
            expectedRevision: nil, settings: settings)
        let reminder = GroceryReminder(
            itemId: command.itemId, revision: UUID(),
            reviewedItemVersion: command.expectedItemVersion, updatedBy: member.userId, settings: settings)
        let receipt = GroceryReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        XCTAssertEqual(try receipt.validated(member: member, expected: command), receipt)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertTrue(wire["expectedRevision"] is NSNull)
        let choices = try XCTUnwrap(wire["settings"] as? [String: Any])
        XCTAssertEqual(choices["localDate"] as? String, "2028-03-01")
        XCTAssertNil(choices["daysBefore"])
        var changed = settings
        changed.localDate = try CivilDate("2028-03-02")
        let altered = SaveGroceryReminder(
            operationId: command.operationId, itemId: command.itemId,
            expectedItemVersion: command.expectedItemVersion, expectedRevision: nil, settings: changed)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: altered))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, expected: command))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-saveGroceryReminder"),
            "state": .string("output-available"), "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantGroceryReminderLink.receipt(part, member: member), receipt)
        XCTAssertNil(AssistantGroceryReminderLink.receipt(part, member: partner))
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantGroceryReminderLink.receipt(part, member: member))
    }

    func testPositiveInt64VersionsAndItemBinding() throws {
        for version in 1...1_000 { XCTAssertTrue(ReminderItemVersion.valid(String(version))) }
        for value in ["", "0", "01", "1\n", "-1", "+1", "1.0", "١", "9223372036854775808"] {
            XCTAssertFalse(ReminderItemVersion.valid(value))
        }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let grocery = GroceryItem(
            itemId: UUID(), name: "Fixture", quantity: nil, unit: nil,
            categoryId: nil, categoryName: nil, version: "1", checked: false,
            legacyClaimed: false, offlineEpoch: nil, mealSource: nil)
        let baseline = GroceryReminderContext(
            version: 1, householdId: member.householdId,
            itemVersion: "1", grocery: grocery, reminder: nil)
        XCTAssertEqual(try baseline.validated(member: member, id: grocery.id), baseline)
        let altered = GroceryReminderContext(
            version: 1, householdId: member.householdId,
            itemVersion: "2", grocery: grocery, reminder: nil)
        XCTAssertThrowsError(try altered.validated(member: member, id: grocery.id))
        XCTAssertThrowsError(try baseline.validated(member: member, id: UUID()))
    }
}
