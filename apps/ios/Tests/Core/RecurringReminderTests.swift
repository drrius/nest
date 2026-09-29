import XCTest

@testable import NestCore

enum RecurringReminderFixture {
    static func rule(_ member: VerifiedMember, status: RecurringRule.Status = .active, due: CivilDate? = nil) throws
        -> RecurringRule
    {
        let day = try CivilDate("2099-01-01")
        return .init(
            ruleId: UUID(), revision: UUID(),
            configuration: .init(
                description: "Fictional variable bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: day, schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .variable, amountCentimes: nil, allocations: nil), status: status,
            authorizedBy: member.userId, authorizedAt: "2026-09-01T08:00:00.000000Z",
            coveredThrough: nil, nextDueOn: due ?? day)
    }
}

final class RecurringReminderTests: XCTestCase {
    func testReceiptBindsExactRuleRevisionDueDateScopeAndExplicitConsent() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let rule = try RecurringReminderFixture.rule(member)
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let command = SaveRecurringReminder(
            operationId: UUID(), ruleId: rule.id,
            expectedRuleRevision: rule.revision, expectedDueOn: rule.nextDueOn!, expectedRevision: nil,
            settings: settings)
        let reminder = RecurringReminder(
            ruleId: rule.id, revision: UUID(), reviewedRuleRevision: rule.revision,
            reviewedDueOn: rule.nextDueOn!, updatedBy: member.userId, settings: settings)
        let receipt = RecurringReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        XCTAssertEqual(try receipt.validated(member: member, expected: command), receipt)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertTrue(wire["expectedRevision"] is NSNull)
        XCTAssertEqual(wire["expectedDueOn"] as? String, "2099-01-01")
        let changedDate = SaveRecurringReminder(
            operationId: command.operationId, ruleId: rule.id,
            expectedRuleRevision: rule.revision, expectedDueOn: try CivilDate("2099-02-01"), expectedRevision: nil,
            settings: settings)
        let changedRule = SaveRecurringReminder(
            operationId: command.operationId, ruleId: rule.id,
            expectedRuleRevision: UUID(), expectedDueOn: rule.nextDueOn!, expectedRevision: nil, settings: settings)
        XCTAssertThrowsError(try receipt.validated(member: member, expected: changedDate))
        XCTAssertThrowsError(try receipt.validated(member: member, expected: changedRule))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, expected: command))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-saveRecurringReminder"),
            "state": .string("output-available"), "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantRecurringReminderLink.receipt(part, member: member), receipt)
        XCTAssertNil(AssistantRecurringReminderLink.receipt(part, member: partner))
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantRecurringReminderLink.receipt(part, member: member))
        part["state"] = .string("output-available")
        part["type"] = .string("tool-saveRecurring")
        XCTAssertNil(AssistantRecurringReminderLink.receipt(part, member: member))
    }

    func testContextAndPersistedBaselineRejectSubstitutionOrInactiveRule() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let rule = try RecurringReminderFixture.rule(member)
        let baseline = RecurringReminderContext(version: 1, householdId: member.householdId, rule: rule, reminder: nil)
        XCTAssertEqual(try baseline.validated(member: member, id: rule.id), baseline)
        XCTAssertThrowsError(try baseline.validated(member: member, id: UUID()))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try baseline.validated(member: foreign, id: rule.id))
        let off = ReminderSettings(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0)
        let changed = SaveRecurringReminder(
            operationId: UUID(), ruleId: rule.id, expectedRuleRevision: rule.revision,
            expectedDueOn: try CivilDate("2099-02-01"), expectedRevision: nil, settings: off)
        XCTAssertThrowsError(
            try SavedRecurringReminderRequest(baseline: baseline, command: changed).validated(member: member))
        for status in [RecurringRule.Status.paused, .cancelled] {
            let inactive = try RecurringReminderFixture.rule(member, status: status)
            let context = RecurringReminderContext(
                version: 1, householdId: member.householdId, rule: inactive, reminder: nil)
            let command = SaveRecurringReminder(
                operationId: UUID(), ruleId: inactive.id, expectedRuleRevision: inactive.revision,
                expectedDueOn: inactive.nextDueOn!, expectedRevision: nil, settings: off)
            XCTAssertThrowsError(
                try SavedRecurringReminderRequest(baseline: context, command: command).validated(member: member))
        }
    }
}
