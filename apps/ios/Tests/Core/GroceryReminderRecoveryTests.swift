import XCTest

@testable import NestCore

final class GroceryReminderRecoveryTests: XCTestCase {
    func testRestartAndRecipientConsentCannotBeLostOrReplaced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "reminder-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let grocery = GroceryItem(
            itemId: UUID(), name: "Fictional grocery", quantity: nil, unit: nil,
            categoryId: nil, categoryName: nil, version: "1", checked: false,
            legacyClaimed: false, offlineEpoch: nil, mealSource: nil)
        let settings = DatedReminderSettings(
            enabled: false, recipientIds: [], localDate: try CivilDate("2027-01-01"), localTime: "08:00")
        let fingerprint = "1"
        let command = SaveGroceryReminder(
            operationId: UUID(), itemId: grocery.id,
            expectedItemVersion: fingerprint, expectedRevision: nil, settings: settings)
        let baseline = GroceryReminderContext(
            version: 1, householdId: member.householdId,
            itemVersion: fingerprint, grocery: grocery, reminder: nil)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.stageGroceryReminderRequest(
            .init(
                baseline: baseline, command: command,
                result: nil), lease: lease)
        try await first.requestGroceryReminderCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readGroceryReminderRequest(lease: current)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.cancellationRequested, true)
        do {
            try await reopened.finishGroceryReminderRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain reminder consent")
        } catch {}
        var changed = settings
        changed.enabled = true
        changed.recipientIds = [member.userId]
        let reminder = GroceryReminder(
            itemId: grocery.id, revision: UUID(),
            reviewedItemVersion: fingerprint, updatedBy: member.userId,
            settings: changed)
        let receipt = GroceryReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        let forged = GroceryReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        do {
            try await reopened.recordGroceryReminderRecovery(forged, lease: current)
            XCTFail("Accepted invented opt-in")
        } catch {}
        let cancelled = GroceryReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.recordGroceryReminderRecovery(cancelled, lease: current)
        let unresolved = GroceryReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        do {
            try await reopened.recordGroceryReminderRecovery(unresolved, lease: current)
            XCTFail("Regressed terminal cancellation")
        } catch {}
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let other = try await reopened.activate(partner)
        let foreign = try await reopened.readGroceryReminderRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await reopened.readGroceryReminderRequest(lease: current)
            XCTFail("Used revoked lease")
        } catch {}
        let finalLease = try await reopened.activate(member)
        try await reopened.finishGroceryReminderRequest(operation: command.operationId, lease: finalLease)
        let cleared = try await reopened.readGroceryReminderRequest(lease: finalLease)
        XCTAssertNil(cleared)
    }
}
