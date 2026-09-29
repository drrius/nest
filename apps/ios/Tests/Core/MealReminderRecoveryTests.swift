import XCTest

@testable import NestCore

final class MealReminderRecoveryTests: XCTestCase {
    func testRestartAndRecipientConsentCannotBeLostOrReplaced() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "reminder-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let meal = PlannedMeal(
            entryId: UUID(), date: try CivilDate("2027-01-01"), slot: .dinner, title: "Fictional meal",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
        let settings = ReminderSettings(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0)
        let fingerprint = String(repeating: "a", count: 64)
        let command = SaveMealReminder(
            operationId: UUID(), entryId: meal.id,
            expectedItemRevision: fingerprint, expectedRevision: nil, settings: settings)
        let baseline = MealReminderContext(
            version: 1, householdId: member.householdId,
            itemRevision: fingerprint, meal: meal, reminder: nil)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.stageMealReminderRequest(
            .init(
                baseline: baseline, command: command,
                result: nil), lease: lease)
        try await first.requestMealReminderCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readMealReminderRequest(lease: current)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.cancellationRequested, true)
        do {
            try await reopened.finishMealReminderRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain reminder consent")
        } catch {}
        var changed = settings
        changed.enabled = true
        changed.recipientIds = [member.userId]
        let reminder = MealReminder(
            entryId: meal.id, revision: UUID(),
            reviewedItemRevision: fingerprint, updatedBy: member.userId,
            settings: changed)
        let receipt = MealReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: reminder)
        let forged = MealReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        do {
            try await reopened.recordMealReminderRecovery(forged, lease: current)
            XCTFail("Accepted invented opt-in")
        } catch {}
        let cancelled = MealReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.recordMealReminderRecovery(cancelled, lease: current)
        let unresolved = MealReminderRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        do {
            try await reopened.recordMealReminderRecovery(unresolved, lease: current)
            XCTFail("Regressed terminal cancellation")
        } catch {}
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let other = try await reopened.activate(partner)
        let foreign = try await reopened.readMealReminderRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await reopened.readMealReminderRequest(lease: current)
            XCTFail("Used revoked lease")
        } catch {}
        let finalLease = try await reopened.activate(member)
        try await reopened.finishMealReminderRequest(operation: command.operationId, lease: finalLease)
        let cleared = try await reopened.readMealReminderRequest(lease: finalLease)
        XCTAssertNil(cleared)
    }
}
