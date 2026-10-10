import Foundation
import XCTest

@testable import NestCore

final class CalendarPrivacyStoreTests: XCTestCase {
    func testIntentSurvivesReopenAndCannotCrossActorOrHousehold() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        let original = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        let repeated = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertEqual(original, repeated)
        let reopened = try ChoreOfflineStore(url: fixture.url)
        let lease = try await reopened.activate(fixture.member)
        let recovered = try await reopened.readCalendarPrivacyRemoval(lease: lease)
        XCTAssertEqual(recovered, original)
        for member in [
            VerifiedMember(userId: UUID(), householdId: fixture.member.householdId, displayName: "Other actor"),
            VerifiedMember(userId: fixture.member.userId, householdId: UUID(), displayName: "Other household"),
        ] {
            let other = try await reopened.activate(member)
            let hidden = try await reopened.readCalendarPrivacyRemoval(lease: other)
            XCTAssertNil(hidden)
        }
        do {
            _ = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
            XCTFail("Used a stale lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(fixture.member)
        let own = try await reopened.readCalendarPrivacyRemoval(lease: restored)
        XCTAssertEqual(own, original)
    }

    func testGeneratedOffReceiptsFenceUncertainEnableIncludingAlreadyDisabledServer() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        for revision in 0..<100 {
            let current = CalendarConsent(incarnation: UUID(), version: String(revision), enabled: false)
            try await fixture.store.enqueueCalendarConsentChange(
                current: current, enabled: true, operation: UUID(), lease: fixture.lease)
            try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
            do {
                try await fixture.store.clearUnneededCalendarPrivacyRemoval(current, lease: fixture.lease)
                XCTFail("Cleared intent while an enable could still apply")
            } catch OfflineFailure.invalidOperation {}
            let command = try await fixture.store.stageCalendarPrivacyRemoval(current: current, lease: fixture.lease)
            XCTAssertFalse(command.enabled)
            try await fixture.store.confirmCalendarPrivacyRemoval(fixture.receipt(command), lease: fixture.lease)
            let pending = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
            let removal = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
            XCTAssertNil(pending)
            XCTAssertNil(removal)
        }
    }

    func testRemovalBlocksNewChangesAndOnlyKnownRejectionAllowsRebase() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        for enabled in [false, true] {
            do {
                try await fixture.store.enqueueCalendarConsentChange(
                    current: fixture.current, enabled: enabled, operation: UUID(), lease: fixture.lease)
                XCTFail("Staged over pending privacy removal")
            } catch OfflineFailure.invalidOperation {}
        }
        let first = try await fixture.store.stageCalendarPrivacyRemoval(current: fixture.current, lease: fixture.lease)
        let before = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        do {
            try await fixture.store.rejectCalendarPrivacyRemoval(operation: UUID(), lease: fixture.lease)
            XCTFail("Rejected another removal")
        } catch OfflineFailure.invalidOperation {}
        let unchanged = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertEqual(before, unchanged)
        try await fixture.store.rejectCalendarPrivacyRemoval(operation: first.operationId, lease: fixture.lease)
        let rebased = try await fixture.store.stageCalendarPrivacyRemoval(
            current: .init(incarnation: first.incarnation, version: "9", enabled: true), lease: fixture.lease)
        XCTAssertNotEqual(first.operationId, rebased.operationId)
        XCTAssertEqual(rebased.expectedRevision, "9")
        let after = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertEqual(before?.id, after?.id)
    }

    func testWrongReceiptsDoNotClearEitherIntent() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        try await fixture.store.enqueueCalendarConsentChange(
            current: fixture.current, enabled: true, operation: UUID(), lease: fixture.lease)
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        let command = try await fixture.store.stageCalendarPrivacyRemoval(
            current: fixture.current, lease: fixture.lease)
        let correct = fixture.receipt(command)
        for receipt in [
            CalendarConsentReceipt(
                version: 1, actorId: UUID(), householdId: correct.householdId, operationId: correct.operationId,
                consent: correct.consent),
            CalendarConsentReceipt(
                version: 1, actorId: correct.actorId, householdId: UUID(), operationId: correct.operationId,
                consent: correct.consent),
            CalendarConsentReceipt(
                version: 1, actorId: correct.actorId, householdId: correct.householdId, operationId: UUID(),
                consent: correct.consent),
            fixture.receipt(command, version: "99"), fixture.receipt(command, enabled: true),
        ] {
            do {
                try await fixture.store.confirmCalendarPrivacyRemoval(receipt, lease: fixture.lease)
                XCTFail("Cleared removal using a foreign or mismatched receipt")
            } catch CalendarConsentError.invalid {}
            let pending = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
            let removal = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
            XCTAssertNotNil(pending)
            XCTAssertEqual(removal?.command, command)
        }
    }

    func testAtomicConfirmationRollsBackIfRemovalDeleteFails() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        try await fixture.store.enqueueCalendarConsentChange(
            current: fixture.current, enabled: true, operation: UUID(), lease: fixture.lease)
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        let command = try await fixture.store.stageCalendarPrivacyRemoval(
            current: fixture.current, lease: fixture.lease)
        let injection = try SQLiteConnection(url: fixture.url)
        try injection.run(
            "CREATE TRIGGER reject_privacy_delete BEFORE DELETE ON calendar_privacy_removals BEGIN SELECT RAISE(ABORT,'fixture failure'); END"
        )
        do {
            try await fixture.store.confirmCalendarPrivacyRemoval(fixture.receipt(command), lease: fixture.lease)
            XCTFail("Lost intent on failed SQLite commit")
        } catch OfflineFailure.storage {}
        let pending = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
        let removal = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertNotNil(pending)
        XCTAssertEqual(removal?.command, command)
        try injection.run("DROP TRIGGER reject_privacy_delete")
        try await fixture.store.confirmCalendarPrivacyRemoval(fixture.receipt(command), lease: fixture.lease)
    }

    func testOldEnableReplyCannotEraseLatchedNeedForOffFence() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        let original = UUID()
        try await fixture.store.enqueueCalendarConsentChange(
            current: fixture.current, enabled: true, operation: original, lease: fixture.lease)
        let pending = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
        let enable = try XCTUnwrap(pending?.command)
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        // The old enable completes after the removal's GET captured an earlier disabled revision.
        try await fixture.store.confirmCalendarConsentChange(
            fixture.receipt(enable, enabled: true), lease: fixture.lease)
        let staleDisabledRead = CalendarConsent(incarnation: fixture.current.incarnation, version: "4", enabled: false)
        do {
            try await fixture.store.clearUnneededCalendarPrivacyRemoval(staleDisabledRead, lease: fixture.lease)
            XCTFail("Used a stale off read after the old enable completed")
        } catch OfflineFailure.invalidOperation {}
        let retained = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertEqual(retained?.requiresFence, true)
        let fresh = CalendarConsent(incarnation: fixture.current.incarnation, version: "5", enabled: true)
        let command = try await fixture.store.stageCalendarPrivacyRemoval(current: fresh, lease: fixture.lease)
        try await fixture.store.confirmCalendarPrivacyRemoval(fixture.receipt(command), lease: fixture.lease)
        let finished = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
        XCTAssertNil(finished)
    }

    func testOlderOffReceiptCannotClearARequestAtOrBeyondItsRevision() async throws {
        let fixture = try await CalendarPrivacyFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.url) }
        try await fixture.store.enqueueCalendarConsentChange(
            current: fixture.current, enabled: true, operation: UUID(), lease: fixture.lease)
        try await fixture.store.rememberCalendarPermissionLoss(lease: fixture.lease)
        let command = try await fixture.store.stageCalendarPrivacyRemoval(
            current: fixture.current, lease: fixture.lease)
        let original = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
        let saved = try XCTUnwrap(original)
        let injection = try SQLiteConnection(url: fixture.url)
        for revision in [Int64(5), 6, Int64.max - 1] {
            let future = SavedCalendarConsent(
                command: .init(
                    incarnation: command.incarnation, operationId: saved.command.operationId,
                    expectedRevision: String(revision), enabled: true), conflict: false)
            let body = String(decoding: try JSONEncoder().encode(future), as: UTF8.self)
            try injection.run(
                "UPDATE calendar_consent_changes SET body=? WHERE actor=? AND household=?", [body] + fixture.lease.scope
            )
            do {
                try await fixture.store.confirmCalendarPrivacyRemoval(fixture.receipt(command), lease: fixture.lease)
                XCTFail("Cleared a request not proven superseded by the off receipt")
            } catch OfflineFailure.invalidOperation {}
            let pending = try await fixture.store.readCalendarConsentChange(lease: fixture.lease)
            let removal = try await fixture.store.readCalendarPrivacyRemoval(lease: fixture.lease)
            XCTAssertEqual(pending?.command, future.command)
            XCTAssertEqual(removal?.command, command)
        }
    }
}

private struct CalendarPrivacyFixture {
    let url: URL
    let member: VerifiedMember
    let store: ChoreOfflineStore
    let lease: OfflineLease
    let current = CalendarConsent(incarnation: UUID(), version: "4", enabled: true)

    static func make() async throws -> Self {
        let url = FileManager.default.temporaryDirectory.appending(path: "calendar-privacy-\(UUID()).sqlite")
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        return try await Self(url: url, member: member, store: store, lease: store.activate(member))
    }

    func receipt(_ command: SetCalendarConsent, version: String? = nil, enabled: Bool = false) -> CalendarConsentReceipt
    {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            consent: .init(
                incarnation: command.incarnation,
                version: version ?? String(Int64(command.expectedRevision)! + 1), enabled: enabled))
    }
}
