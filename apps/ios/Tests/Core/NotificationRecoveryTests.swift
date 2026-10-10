import XCTest

@testable import NestCore

final class NotificationRecoveryTests: XCTestCase {
    func testRestartPreservesUncertainSaveAndOnlyExactReceiptAllowsFinish() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "notification-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: "0",
            preferences: .init(dailySummaryEnabled: true, dailySummaryTime: "07:30", itemRemindersEnabled: false))
        let saved = SavedNotificationPreference(
            baseline: .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                timeZone: "Europe/Zurich", profile: nil), command: command, state: .pending, receipt: nil)
        let original = try ChoreOfflineStore(url: url)
        let firstLease = try await original.activate(member)
        try await original.stageNotificationRequest(saved, lease: firstLease)
        let reopened = try ChoreOfflineStore(url: url)
        let lease = try await reopened.activate(member)
        let retained = try await reopened.readNotificationRequest(lease: lease)
        XCTAssertEqual(retained, saved)
        do {
            try await reopened.finishNotificationRequest(operation: command.operationId, lease: lease)
            XCTFail("Erased uncertain save")
        } catch {}
        do {
            try await reopened.stageNotificationRequest(saved, lease: lease)
            XCTFail("Overwrote original intent")
        } catch {}
        let wrong = NotificationPreferenceReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: UUID(), revision: "1")
        do {
            try await reopened.acknowledgeNotificationRequest(wrong, lease: lease)
            XCTFail("Acknowledged a different save")
        } catch {}
        let pending = try await reopened.readNotificationRequest(lease: lease)
        XCTAssertEqual(pending?.state, .pending)
        let receipt = NotificationPreferenceReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId, revision: "1")
        try await reopened.acknowledgeNotificationRequest(receipt, lease: lease)
        try await reopened.finishNotificationRequest(operation: command.operationId, lease: lease)
        let cleared = try await reopened.readNotificationRequest(lease: lease)
        XCTAssertNil(cleared)
    }

    func testActorIsolationAndRejectedSaveCannotBeAcknowledged() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "notification-scope-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let command = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: "1",
            preferences: .init(dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: true))
        let baseline = NotificationProfileEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, timeZone: "Europe/Zurich",
            profile: .init(revision: "1", preferences: command.preferences))
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.stageNotificationRequest(
            .init(baseline: baseline, command: command, state: .pending, receipt: nil), lease: lease)
        let other = try await store.activate(partner)
        let foreign = try await store.readNotificationRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readNotificationRequest(lease: lease)
            XCTFail("Used invalidated lease")
        } catch {}
        let current = try await store.activate(member)
        try await store.conflictNotificationRequest(operation: command.operationId, lease: current)
        do {
            try await store.acknowledgeNotificationRequest(
                .init(
                    actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, revision: "2"), lease: current)
            XCTFail("Revived rejected operation")
        } catch {}
        try await store.finishNotificationRequest(operation: command.operationId, lease: current)
    }
}
