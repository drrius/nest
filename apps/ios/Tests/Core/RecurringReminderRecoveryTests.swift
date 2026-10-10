import XCTest

@testable import NestCore

final class RecurringReminderRecoveryTests: XCTestCase {
    func testRestartAndRecipientConsentCannotBeLostOrReplaced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "reminder-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let rule = try RecurringReminderFixture.rule(member)
        let settings = ReminderSettings(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0)
        let command = SaveRecurringReminder(
            operationId: UUID(), ruleId: rule.id,
            expectedRuleRevision: rule.revision, expectedDueOn: rule.nextDueOn!, expectedRevision: nil,
            settings: settings)
        let baseline = RecurringReminderContext(
            version: 1, householdId: member.householdId,
            rule: rule, reminder: nil)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.stageRecurringReminderRequest(
            .init(
                baseline: baseline, command: command,
                result: nil), lease: lease)
        try await first.requestRecurringReminderCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRecurringReminderRequest(lease: current)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.cancellationRequested, true)
        do {
            try await reopened.finishRecurringReminderRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain reminder consent")
        } catch {}
        var changed = settings
        changed.enabled = true
        changed.recipientIds = [member.userId]
        let reminder = RecurringReminder(
            ruleId: rule.id, revision: UUID(),
            reviewedRuleRevision: rule.revision, reviewedDueOn: rule.nextDueOn!, updatedBy: member.userId,
            settings: changed)
        let receipt = RecurringReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        let forged = RecurringReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        do {
            try await reopened.recordRecurringReminderRecovery(forged, lease: current)
            XCTFail("Accepted invented opt-in")
        } catch {}
        let cancelled = RecurringReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.recordRecurringReminderRecovery(cancelled, lease: current)
        let unresolved = RecurringReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        do {
            try await reopened.recordRecurringReminderRecovery(unresolved, lease: current)
            XCTFail("Regressed terminal cancellation")
        } catch {}
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let other = try await reopened.activate(partner)
        let foreign = try await reopened.readRecurringReminderRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await reopened.readRecurringReminderRequest(lease: current)
            XCTFail("Used revoked lease")
        } catch {}
        let finalLease = try await reopened.activate(member)
        try await reopened.finishRecurringReminderRequest(operation: command.operationId, lease: finalLease)
        let cleared = try await reopened.readRecurringReminderRequest(lease: finalLease)
        XCTAssertNil(cleared)
    }
}
