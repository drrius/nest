import XCTest

@testable import NestCore

final class RenewalReminderRecoveryTests: XCTestCase {
    func testRestartAndRecipientConsentCannotBeLostOrReplaced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "reminder-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let fields = CalendarRenewal.Fields(
            title: "Fixture", renewalOn: try CivilDate("2027-01-01"),
            noticeDays: 5, responsibleId: nil, recurringRuleId: nil)
        let renewal = CalendarRenewal(
            renewalId: UUID(), revision: UUID(), fields: fields,
            cancellationOn: fields.cancellationDeadline!, removed: false)
        let settings = RenewalReminderSettings(
            anchor: .cancellation,
            delivery: .init(
                enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0))
        let command = SaveRenewalReminder(
            operationId: UUID(), renewalId: renewal.id,
            expectedRenewalRevision: renewal.revision, expectedRevision: nil,
            settings: settings)
        let baseline = RenewalReminderEnvelope(
            version: 1, householdId: member.householdId,
            renewalId: renewal.id, reminder: nil)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.stageRenewalReminderRequest(
            .init(
                renewal: renewal, baseline: baseline, command: command,
                result: nil), lease: lease)
        try await first.requestRenewalReminderCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRenewalReminderRequest(lease: current)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.cancellationRequested, true)
        do {
            try await reopened.finishRenewalReminderRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain reminder consent")
        } catch {}
        var changed = settings
        changed.delivery.enabled = true
        changed.delivery.recipientIds = [member.userId]
        let reminder = RenewalReminder(
            renewalId: renewal.id, revision: UUID(),
            reviewedRenewalRevision: renewal.revision, updatedBy: member.userId,
            settings: changed)
        let receipt = RenewalReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        let forged = RenewalReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        do {
            try await reopened.recordRenewalReminderRecovery(forged, lease: current)
            XCTFail("Accepted invented opt-in")
        } catch {}
        let cancelled = RenewalReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.recordRenewalReminderRecovery(cancelled, lease: current)
        let unresolved = RenewalReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        do {
            try await reopened.recordRenewalReminderRecovery(unresolved, lease: current)
            XCTFail("Regressed terminal cancellation")
        } catch {}
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let other = try await reopened.activate(partner)
        let foreign = try await reopened.readRenewalReminderRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await reopened.readRenewalReminderRequest(lease: current)
            XCTFail("Used revoked lease")
        } catch {}
        let finalLease = try await reopened.activate(member)
        try await reopened.finishRenewalReminderRequest(operation: command.operationId, lease: finalLease)
        let cleared = try await reopened.readRenewalReminderRequest(lease: finalLease)
        XCTAssertNil(cleared)
    }
}
