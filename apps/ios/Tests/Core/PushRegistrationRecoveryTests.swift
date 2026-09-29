import Foundation
import XCTest

@testable import NestCore

final class PushRegistrationRecoveryTests: XCTestCase {
    private typealias F = PushRegistrationFixtures

    func testRestartKeepsExactUncertainCommandAndDurableCancellationWithoutAutomaticReplay() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let saved = SavedPushDeviceRequest(baseline: F.baseline, command: F.command)
        let store = try ChoreOfflineStore(url: url)
        let first = try await store.activate(F.member)
        try await store.stagePushDeviceRequest(saved, lease: first)
        let automatic = try await store.next(first)
        XCTAssertNil(automatic)
        try await store.requestPushDeviceCancellation(lease: first)
        let reopened = try ChoreOfflineStore(url: url)
        let lease = try await reopened.activate(F.member)
        let retained = try await reopened.readPushDeviceRequest(lease: lease)
        XCTAssertEqual(retained?.command, F.command)
        XCTAssertEqual(retained?.cancellationRequested, true)
        do {
            try await reopened.finishPushDeviceRequest(operation: F.command.operationId, lease: lease)
            XCTFail("Erased uncertain enrollment")
        } catch {}
        do {
            try await reopened.stagePushDeviceRequest(saved, lease: lease)
            XCTFail("Replaced original identity")
        } catch {}
        try await reopened.recordPushDeviceRecovery(F.recovery(.cancelled), lease: lease)
        do {
            try await reopened.recordPushDeviceRecovery(F.recovery(.recorded), lease: lease)
            XCTFail("Revived cancelled enrollment")
        } catch {}
        try await reopened.finishPushDeviceRequest(operation: F.command.operationId, lease: lease)
        let cleared = try await reopened.readPushDeviceRequest(lease: lease)
        XCTAssertNil(cleared)
        XCTAssertFalse(String(reflecting: saved).contains(F.command.token!))
    }

    func testReceiptSubstitutionLeavesRequestPendingAndExactAcknowledgementCannotRegress() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-receipt-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(F.member)
        try await store.stagePushDeviceRequest(.init(baseline: F.baseline, command: F.command), lease: lease)
        let wrong = PushDeviceCommand(
            operationId: F.command.operationId, installationId: F.command.installationId,
            expectedRevision: nil, action: .register, token: F.command.token, environment: .production)
        do {
            try await store.recordPushDeviceRecovery(F.recovery(.recorded, command: wrong), lease: lease)
            XCTFail("Accepted another environment")
        } catch {}
        let pending = try await store.readPushDeviceRequest(lease: lease)
        XCTAssertNil(pending?.result)
        let exact = try F.recovery(.recorded)
        try await store.recordPushDeviceRecovery(exact, lease: lease)
        try await store.recordPushDeviceRecovery(exact, lease: lease)
        do {
            try await store.recordPushDeviceRecovery(F.recovery(.unresolved), lease: lease)
            XCTFail("Lost terminal evidence")
        } catch {}
        try await store.finishPushDeviceRequest(operation: F.command.operationId, lease: lease)
    }

    func testPartnerIsolationLeaseInvalidationAndBaselineRevisionProtection() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "push-scope-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(F.member)
        let wrong = PushDeviceCommand(
            operationId: F.command.operationId, installationId: F.command.installationId,
            expectedRevision: UUID(), action: .register, token: F.command.token, environment: .sandbox)
        do {
            try await store.stagePushDeviceRequest(.init(baseline: F.baseline, command: wrong), lease: lease)
            XCTFail("Accepted unreviewed revision")
        } catch {}
        try await store.stagePushDeviceRequest(.init(baseline: F.baseline, command: F.command), lease: lease)
        let partner = VerifiedMember(userId: F.id(2), householdId: F.member.householdId, displayName: "Partner")
        let other = try await store.activate(partner)
        let foreign = try await store.readPushDeviceRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readPushDeviceRequest(lease: lease)
            XCTFail("Used an old lease")
        } catch {}
        do {
            try await store.recordPushDeviceRecovery(F.recovery(.recorded), lease: other)
            XCTFail("Stored foreign receipt")
        } catch {}
        let current = try await store.activate(F.member)
        let original = try await store.readPushDeviceRequest(lease: current)
        XCTAssertEqual(original?.command, F.command)
    }
}
