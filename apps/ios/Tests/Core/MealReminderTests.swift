import XCTest

@testable import NestCore

final class MealReminderTests: XCTestCase {
    func testStoredMealUnicodeBoundariesMatchBackendScalarLimits() throws {
        let id = UUID()
        func meal(_ title: String, notes: String? = nil, source: UUID? = nil) throws -> PlannedMeal {
            .init(
                entryId: id, date: try CivilDate("2028-03-01"), slot: .dinner, title: title,
                recipeUrl: nil, notes: notes, definitionId: nil, leftoverSourceId: source)
        }
        _ = try meal("  " + String(repeating: "🍲", count: 120) + "  ").validated()
        XCTAssertThrowsError(try meal(String(repeating: "🍲", count: 121)).validated())
        _ = try meal("\t").validated()
        XCTAssertThrowsError(try meal("   ").validated())
        _ = try meal("Fixture", notes: String(repeating: "a\u{301}", count: 2000)).validated()
        XCTAssertThrowsError(try meal("Fixture", notes: String(repeating: "a\u{301}", count: 2001)).validated())
        XCTAssertThrowsError(try meal("Fixture", notes: "bad\0notes").validated())
        XCTAssertThrowsError(try meal("Fixture", source: id).validated())
    }

    func testExactFingerprintScopeAndConsentRequiredForReceipts() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let fingerprint = String(repeating: "a", count: 64)
        let command = SaveMealReminder(
            operationId: UUID(), entryId: UUID(), expectedItemRevision: fingerprint,
            expectedRevision: nil, settings: settings)
        let reminder = MealReminder(
            entryId: command.entryId, revision: UUID(),
            reviewedItemRevision: fingerprint, updatedBy: member.userId, settings: settings)
        let receipt = MealReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        XCTAssertEqual(try receipt.validated(member: member, expected: command), receipt)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertTrue(wire["expectedRevision"] is NSNull)
        let changed = SaveMealReminder(
            operationId: command.operationId, entryId: command.entryId,
            expectedItemRevision: String(repeating: "b", count: 64),
            expectedRevision: nil, settings: settings)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: changed))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, expected: command))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-saveMealReminder"),
            "state": .string("output-available"), "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantMealReminderLink.receipt(part, member: member), receipt)
        XCTAssertNil(AssistantMealReminderLink.receipt(part, member: partner))
        part["type"] = .string("tool-saveChoreReminder")
        XCTAssertNil(AssistantMealReminderLink.receipt(part, member: member))
        part["type"] = .string("tool-saveMealReminder")
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantMealReminderLink.receipt(part, member: member))
    }

    func testFingerprintAndContextDoNotAcceptSubstitutedTargets() throws {
        for value in [
            "", String(repeating: "a", count: 63), String(repeating: "a", count: 65),
            String(repeating: "A", count: 64), String(repeating: "g", count: 64),
            String(repeating: "a", count: 64) + "\n",
        ] {
            XCTAssertFalse(ReminderFingerprint.valid(value))
        }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let meal = PlannedMeal(
            entryId: UUID(), date: try CivilDate("2028-03-01"), slot: .dinner, title: "Fixture",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let baseline = MealReminderContext(
            version: 1, householdId: member.householdId,
            itemRevision: String(repeating: "a", count: 64), meal: meal, reminder: nil)
        XCTAssertEqual(try baseline.validated(member: member, id: meal.id), baseline)
        XCTAssertThrowsError(try baseline.validated(member: member, id: UUID()))
        let outsider = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try baseline.validated(member: outsider, id: meal.id))
    }
}
