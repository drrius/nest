import Foundation
import XCTest

@testable import Nest

@MainActor
final class CalendarPrivacyModelTests: XCTestCase {
    func testAllowedOrNotRequestedDoesNotReadOrChangeConsentWithoutRemovalIntent() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        for access in [CalendarAccess.allowed, .notRequested] {
            await fixture.model.refreshCalendarPrivacy(access: access)
            XCTAssertFalse(fixture.model.calendarPrivacyPending)
        }
        let reads = await fixture.server.reads
        let writes = await fixture.server.writes
        XCTAssertEqual(reads, 0)
        XCTAssertTrue(writes.isEmpty)
    }

    func testOfflineBeforeConsentReadRetainsIntentAndRestoringAccessDoesNotReenable() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.setOfflineRead(true)
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        XCTAssertTrue(fixture.model.calendarPrivacyPending)
        XCTAssertFalse(fixture.model.calendarPrivacyRemoving)
        let original = try await fixture.model.calendarConsentContext()
        XCTAssertNotNil(original.removal)
        XCTAssertNil(original.removal?.command)
        let current = await fixture.server.current()
        do {
            _ = try await fixture.model.beginCalendarCapture(original, consent: current)
            XCTFail("Started publishing while removal was pending")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await fixture.model.stageCalendarConsent(current, enabled: true, context: original)
            XCTFail("Allowed enable while removal was pending")
        } catch OfflineFailure.invalidOperation {}
        let reopened = try await fixture.reopened()
        let restored = try await reopened.calendarConsentContext()
        XCTAssertEqual(restored.removal?.id, original.removal?.id)
        await fixture.server.setOfflineRead(false)
        await reopened.refreshCalendarPrivacy(access: .allowed)
        let finished = try await reopened.calendarConsentContext()
        let writes = await fixture.server.writes
        XCTAssertNil(finished.removal)
        XCTAssertFalse(reopened.calendarPrivacyPending)
        XCTAssertEqual(writes.count, 1)
        XCTAssertTrue(writes.allSatisfy { !$0.enabled })
        let server = await fixture.server.current()
        XCTAssertFalse(server.enabled)
    }

    func testUncertainEnableIsFencedOffWithoutEverReplayingIt() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.setEnabled(false)
        let current = await fixture.server.current()
        let context = try await fixture.model.calendarConsentContext()
        try await fixture.model.stageCalendarConsent(current, enabled: true, context: context)
        let old = try await fixture.model.calendarConsentContext()
        XCTAssertEqual(old.pending?.command.enabled, true)
        await fixture.model.refreshCalendarPrivacy(access: .restricted)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.enabled, false)
        let finished = try await fixture.model.calendarConsentContext()
        XCTAssertNil(finished.pending)
        XCTAssertNil(finished.removal)
        do {
            _ = try await fixture.model.retryCalendarConsent(old)
            XCTFail("Replayed a superseded enable")
        } catch OfflineFailure.invalidOperation {}
        let server = await fixture.server.current()
        XCTAssertFalse(server.enabled)
        XCTAssertEqual(server.version, "5")
    }

    func testDeclinedPermissionWithSharingAlreadyOffDoesNotWriteConsent() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.setEnabled(false)
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        let finished = try await fixture.model.calendarConsentContext()
        XCTAssertNil(finished.removal)
        XCTAssertFalse(fixture.model.calendarPrivacyPending)
        let writes = await fixture.server.writes
        XCTAssertTrue(writes.isEmpty)
    }

    func testLostWriteReplyKeepsExactOffRequestThroughReopen() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.loseNextReply()
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        let uncertain = try await fixture.model.calendarConsentContext()
        let command = try XCTUnwrap(uncertain.removal?.command)
        XCTAssertFalse(command.enabled)
        XCTAssertTrue(fixture.model.calendarPrivacyPending)
        let reopened = try await fixture.reopened()
        await reopened.refreshCalendarPrivacy(access: .allowed)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, [command, command])
        let finished = try await reopened.calendarConsentContext()
        XCTAssertNil(finished.removal)
        XCTAssertFalse(reopened.calendarPrivacyPending)
    }

    func testKnownConflictRetainsIntentThenRebasesOnlyOff() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.conflictNextWrite()
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        let rejected = try await fixture.model.calendarConsentContext()
        let intent = try XCTUnwrap(rejected.removal)
        XCTAssertNil(intent.command)
        XCTAssertTrue(fixture.model.calendarPrivacyPending)
        await fixture.model.refreshCalendarPrivacy(access: .allowed)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes.count, 2)
        XCTAssertNotEqual(writes[0].operationId, writes[1].operationId)
        XCTAssertEqual(writes.map(\.expectedRevision), ["4", "8"])
        XCTAssertTrue(writes.allSatisfy { !$0.enabled })
        let finished = try await fixture.model.calendarConsentContext()
        XCTAssertNil(finished.removal)
    }

    func testEnableAcknowledgementDuringStaleOffReadCannotClearRemovalIntent() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.setEnabled(false)
        let current = await fixture.server.current()
        let context = try await fixture.model.calendarConsentContext()
        try await fixture.model.stageCalendarConsent(current, enabled: true, context: context)
        let original = try await fixture.model.calendarConsentContext()
        let enable = try XCTUnwrap(original.pending?.command)
        let store = fixture.store
        let lease = try XCTUnwrap(fixture.model.lease)
        await fixture.server.settleEnableDuringRead(enable) { receipt in
            try await store.confirmCalendarConsentChange(receipt, lease: lease)
        }
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        let rejected = try await fixture.model.calendarConsentContext()
        XCTAssertEqual(rejected.removal?.requiresFence, true)
        XCTAssertNil(rejected.removal?.command, "Stale off request is authoritatively rejected; intent stays")
        XCTAssertNil(rejected.pending, "The old enable was acknowledged during the read")
        XCTAssertTrue(fixture.model.calendarPrivacyPending)
        await fixture.model.refreshCalendarPrivacy(access: .allowed)
        let finished = try await fixture.model.calendarConsentContext()
        XCTAssertNil(finished.removal)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes.map(\.enabled), [true, false, false])
        XCTAssertEqual(writes.map(\.expectedRevision), ["4", "4", "5"])
        let server = await fixture.server.current()
        XCTAssertFalse(server.enabled)
        XCTAssertEqual(server.version, "6")
    }

    func testConcurrentForegroundChecksDoNotDuplicateRemoval() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        await fixture.server.pauseNextWrite()
        let first = Task { await fixture.model.refreshCalendarPrivacy(access: .denied) }
        await fixture.server.waitForWrite()
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        let paused = await fixture.server.writes
        XCTAssertEqual(paused.count, 1)
        XCTAssertTrue(fixture.model.calendarPrivacyPending)
        await fixture.server.release()
        await first.value
        let writes = await fixture.server.writes
        XCTAssertEqual(writes.count, 1)
        XCTAssertFalse(fixture.model.calendarPrivacyPending)
    }

    func testLateRemovalReplyAfterMemberSwitchCannotClearOriginalRecoveryOrExposeIt() async throws {
        let fixture = try await CalendarPrivacyModelFixture.make()
        addTeardownBlock { [url = fixture.url] in try FileManager.default.removeItem(at: url) }
        fixture.model.offlineReplayReady = true
        let context = try await fixture.model.calendarConsentContext()
        await fixture.server.pauseNextWrite()
        let removal = Task {
            try await fixture.model.revokeCalendarConsentAfterPermissionLoss(access: .denied, context: context)
        }
        await fixture.server.waitForWrite()
        await fixture.model.refreshCalendarPrivacy(access: .denied)
        await fixture.model.signIn(idToken: "B", nonce: "nonce")
        let other = try await fixture.model.calendarConsentContext()
        XCTAssertNotEqual(other.member.userId, context.member.userId)
        XCTAssertNil(other.removal)
        XCTAssertFalse(fixture.model.calendarPrivacyPending)
        await fixture.server.release()
        do {
            _ = try await removal.value
            XCTFail("Accepted a late old-account acknowledgement")
        } catch OfflineFailure.sessionChanged {}
        XCTAssertFalse(fixture.model.calendarPrivacyPending)
        await fixture.model.signIn(idToken: "A", nonce: "nonce")
        let restored = try await fixture.model.calendarConsentContext()
        XCTAssertNotNil(restored.removal?.command)
        await fixture.model.refreshCalendarPrivacy(access: .allowed)
        let finished = try await fixture.model.calendarConsentContext()
        XCTAssertNil(finished.removal)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes.first, writes.last)
    }
}
