import Foundation
import XCTest

@testable import NestCore

final class PushLogoutRecoveryTests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    func testUnresolvedPriorAccountLogoutBlocksNewEnrollmentWithoutDeletingEitherIntent() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-cleanup-fence-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        try await store.trackPushSession(actor: F.id(2), session: F.id(55))
        try await store.stagePushLogout(actor: F.id(2), session: F.id(55))
        let lease = try await store.activate(F.member)
        do {
            try await store.stagePushDeviceRequest(
                .init(baseline: F.baseline, command: F.command, sessionId: F.id(55)), lease: lease)
            XCTFail("Associated a new account before old-session cleanup")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let pending = try await store.pendingPushLogouts(actor: F.id(2))
        XCTAssertEqual(pending.count, 1)
        let request = try await store.readPushDeviceRequest(lease: lease)
        XCTAssertNil(request)
        let receipt = PushSessionRevocation(version: 1, actorId: F.id(2), sessionId: F.id(55), revoked: true)
        try await store.recordPushLogout(receipt)
        let stillFenced = try await store.hasPendingPushCleanup()
        XCTAssertTrue(stillFenced)
        try await store.finishPushLogout(actor: F.id(2), session: F.id(55))
        try await store.stagePushDeviceRequest(
            .init(baseline: F.baseline, command: F.command, sessionId: F.id(55)), lease: lease)
        let restored = try await store.readPushDeviceRequest(lease: lease)
        XCTAssertEqual(restored?.command, F.command)
    }

    func testPendingMetadataSurvivesRestartAndLeaseRemovalWithoutAutomaticCleanup() async throws {
        let path = NSTemporaryDirectory() + "nest-push-logout-\(UUID()).sqlite"
        defer { for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) } }
        let actor = F.member.userId
        let session = F.id(55)
        var store = try ChoreOfflineStore(url: URL(fileURLWithPath: path))
        let lease = try await store.activate(F.member)
        try await store.stagePushDeviceRequest(
            .init(baseline: F.baseline, command: F.command, sessionId: F.id(55), result: nil), lease: lease)
        try await store.stagePushLogout(actor: actor, session: session)
        try await store.stagePushLogout(actor: actor, session: session)
        try await store.deactivate(lease)
        store = try ChoreOfflineStore(url: URL(fileURLWithPath: path))
        let pending = try await store.pendingPushLogouts(actor: actor)
        XCTAssertEqual(pending, [.init(actorId: actor, sessionId: session, receipt: nil)])
        let outsider = try await store.pendingPushLogouts(actor: F.id(2))
        XCTAssertTrue(outsider.isEmpty)
        do {
            try await store.finishPushLogout(actor: actor, session: session)
            XCTFail("Discarded uncertain logout")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let fresh = try await store.activate(F.member)
        let request = try await store.readPushDeviceRequest(lease: fresh)
        XCTAssertEqual(request?.command, F.command)
        let outbox = try await store.next(fresh)
        XCTAssertNil(outbox)
    }

    func testOnlyExactConfirmedSessionCanFinishAndOtherSessionsRemainPending() async throws {
        let path = NSTemporaryDirectory() + "nest-push-logout-receipt-\(UUID()).sqlite"
        defer { for suffix in ["", "-wal", "-shm"] { try? FileManager.default.removeItem(atPath: path + suffix) } }
        let store = try ChoreOfflineStore(url: URL(fileURLWithPath: path))
        let actor = F.member.userId
        let session = F.id(55)
        let next = F.id(56)
        try await store.stagePushLogout(actor: actor, session: session)
        try await store.stagePushLogout(actor: actor, session: next)
        for receipt in [
            PushSessionRevocation(version: 1, actorId: F.id(2), sessionId: session, revoked: true),
            .init(version: 1, actorId: actor, sessionId: F.id(57), revoked: true),
            .init(version: 1, actorId: actor, sessionId: session, revoked: false),
            .init(version: 2, actorId: actor, sessionId: session, revoked: true),
        ] {
            do {
                try await store.recordPushLogout(receipt)
                XCTFail("Accepted unrelated or negative receipt")
            } catch {}
        }
        let receipt = PushSessionRevocation(version: 1, actorId: actor, sessionId: session, revoked: true)
        try await store.recordPushLogout(receipt)
        try await store.recordPushLogout(receipt)
        try await store.stagePushLogout(actor: actor, session: session)
        let restarted = try ChoreOfflineStore(url: URL(fileURLWithPath: path))
        let before = try await restarted.pendingPushLogouts(actor: actor)
        XCTAssertEqual(before.count, 2)
        XCTAssertEqual(before.first(where: { $0.sessionId == session })?.receipt, receipt)
        try await restarted.finishPushLogout(actor: actor, session: session)
        let remaining = try await restarted.pendingPushLogouts(actor: actor)
        XCTAssertEqual(remaining, [.init(actorId: actor, sessionId: next, receipt: nil)])
    }
}
