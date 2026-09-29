import XCTest

@testable import NestCore

final class ChoreReminderTests: XCTestCase {
    func testExactFingerprintScopeAndConsentRequiredForReceipts() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let fingerprint = String(repeating: "a", count: 64)
        let command = SaveChoreReminder(
            operationId: UUID(), occurrenceId: UUID(), expectedItemRevision: fingerprint,
            expectedRevision: nil, settings: settings)
        let reminder = ChoreReminder(
            occurrenceId: command.occurrenceId, revision: UUID(),
            reviewedItemRevision: fingerprint, updatedBy: member.userId, settings: settings)
        let receipt = ChoreReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        XCTAssertEqual(try receipt.validated(member: member, expected: command), receipt)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertTrue(wire["expectedRevision"] is NSNull)
        let changed = SaveChoreReminder(
            operationId: command.operationId, occurrenceId: command.occurrenceId,
            expectedItemRevision: String(repeating: "b", count: 64),
            expectedRevision: nil, settings: settings)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: changed))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, expected: command))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-saveChoreReminder"),
            "state": .string("output-available"), "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantChoreReminderLink.receipt(part, member: member), receipt)
        XCTAssertNil(AssistantChoreReminderLink.receipt(part, member: partner))
        part["type"] = .string("tool-saveMealReminder")
        XCTAssertNil(AssistantChoreReminderLink.receipt(part, member: member))
        part["type"] = .string("tool-saveChoreReminder")
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantChoreReminderLink.receipt(part, member: member))
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
        let chore = NestChore(
            occurrenceId: UUID(), title: "Fixture", dueDate: try CivilDate("2028-03-01"),
            assigneeId: nil, offlineEpoch: nil)
        let baseline = ChoreReminderContext(
            version: 1, householdId: member.householdId,
            itemRevision: String(repeating: "a", count: 64), chore: chore, reminder: nil)
        XCTAssertEqual(try baseline.validated(member: member, id: chore.id), baseline)
        XCTAssertThrowsError(try baseline.validated(member: member, id: UUID()))
        let outsider = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try baseline.validated(member: outsider, id: chore.id))
    }
}
