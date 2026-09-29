import XCTest

@testable import NestCore

final class RenewalReminderTests: XCTestCase {
    func testExplicitRecipientsClockAndLeadTimeBoundaries() throws {
        let me = UUID()
        let partner = UUID()
        let outsider = UUID()
        for enabled in [false, true] {
            for days in [0, 1, 730] {
                for recipients in [[me], [partner], [me, partner]] {
                    _ = try ReminderSettings(
                        enabled: enabled, recipientIds: recipients, localTime: "23:59",
                        daysBefore: days
                    ).validated(members: [me, partner])
                }
            }
        }
        let disabled = ReminderSettings(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0)
        _ = try disabled.validated(members: [me, partner])
        var invalid = disabled
        invalid.enabled = true
        XCTAssertThrowsError(try invalid.validated())
        invalid.recipientIds = [me, me]
        XCTAssertThrowsError(try invalid.validated())
        invalid.recipientIds = [outsider]
        XCTAssertThrowsError(try invalid.validated(members: [me, partner]))
        invalid.recipientIds = [me]
        for time in ["24:00", "08:60", "8:00", "08:00\n", "08:00 "] {
            invalid.localTime = time
            XCTAssertThrowsError(try invalid.validated())
        }
        invalid.localTime = "00:00"
        for days in [-1, 731, Int.max] {
            invalid.daysBefore = days
            XCTAssertThrowsError(try invalid.validated())
        }
    }

    func testExactReviewedRenewalConsentAndReceiptScope() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let delivery = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 7)
        let settings = RenewalReminderSettings(anchor: .cancellation, delivery: delivery)
        let command = SaveRenewalReminder(
            operationId: UUID(), renewalId: UUID(), expectedRenewalRevision: UUID(),
            expectedRevision: nil, settings: settings)
        let reminder = RenewalReminder(
            renewalId: command.renewalId, revision: UUID(),
            reviewedRenewalRevision: command.expectedRenewalRevision,
            updatedBy: member.userId, settings: settings)
        let receipt = RenewalReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        XCTAssertEqual(try receipt.validated(member: member, expected: command), receipt)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertTrue(json["expectedRevision"] is NSNull)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, expected: command))
        var changed = settings
        changed.delivery.enabled = false
        let altered = SaveRenewalReminder(
            operationId: command.operationId, renewalId: command.renewalId,
            expectedRenewalRevision: command.expectedRenewalRevision,
            expectedRevision: nil, settings: changed)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: altered))
        let wrongRevision = SaveRenewalReminder(
            operationId: command.operationId, renewalId: command.renewalId,
            expectedRenewalRevision: UUID(), expectedRevision: nil, settings: settings)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: wrongRevision))
        let unresolvedWithReceipt = RenewalReminderRecovery(
            version: 1, actorId: member.userId,
            householdId: member.householdId,
            operationId: command.operationId, status: .unresolved,
            receipt: receipt)
        XCTAssertThrowsError(try unresolvedWithReceipt.validated(member: member, command: command))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-saveRenewalReminder"), "state": .string("output-available"),
            "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantRenewalLink.reminderReceipt(part, member: member), receipt)
        XCTAssertNil(AssistantRenewalLink.reminderReceipt(part, member: partner))
        part["type"] = .string("tool-saveRecurringReminder")
        XCTAssertNil(AssistantRenewalLink.reminderReceipt(part, member: member))
        part["type"] = .string("tool-saveRenewalReminder")
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantRenewalLink.reminderReceipt(part, member: member))
        part["state"] = .string("output-available")
        part["output"] = .object(["ok": .bool(false), "value": value])
        XCTAssertNil(AssistantRenewalLink.reminderReceipt(part, member: member))
    }
}
