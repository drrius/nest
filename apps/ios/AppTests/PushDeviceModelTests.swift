import Foundation
import XCTest

@testable import Nest

@MainActor
final class PushDeviceModelTests: XCTestCase {
    func testDisabledLoadDoesNotAskRegisterOrCallUnavailableBackend() async throws {
        let f = try await PushEnrollmentFixture.make(self, build: .disabled)
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        let paths = await f.server.calls()
        XCTAssertTrue(paths.isEmpty)
        XCTAssertNil(model.baseline)
        XCTAssertNil(model.saved)
        XCTAssertNil(model.notice)
        XCTAssertEqual(f.hardware.asks, 0)
        XCTAssertEqual(f.hardware.captures, 0)
        XCTAssertEqual(f.hardware.removals, 0)
    }

    func testPermissionRefusalAndStaleRevisionFailBeforeStaging() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        f.hardware.currentPermission = .denied
        await model.connect(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertNil(model.saved)
        XCTAssertNotNil(model.notice)
        XCTAssertEqual(f.hardware.asks, 1)
        XCTAssertEqual(f.hardware.captures, 0)
        f.hardware.currentPermission = .allowed
        await f.server.rotate()
        await model.connect(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertNil(model.saved)
        XCTAssertEqual(f.hardware.asks, 1, "A changed baseline must be detected before asking iOS")
        let saves = await f.server.saves()
        let tracked = try await f.store.trackedPushSessions(actor: f.member.userId)
        XCTAssertTrue(saves.isEmpty)
        XCTAssertTrue(tracked.isEmpty)
    }

    func testLostCommittedSaveReopensExactRequestAndReadFindsReceiptWithoutResending() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        await f.server.dropNextSaveReply()
        await model.connect(session: f.session, member: f.member, hardware: f.hardware)
        let command = try XCTUnwrap(model.saved?.command)
        XCTAssertEqual(command.token, "00010203")
        XCTAssertEqual(model.saved?.sessionId, f.sessionId)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        let reopened = PushDeviceModel()
        await reopened.load(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(reopened.saved?.command, command)
        await reopened.recover(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        let saves = await f.server.saves()
        XCTAssertEqual(saves, [command])
        XCTAssertEqual(f.hardware.asks, 1)
        XCTAssertEqual(f.hardware.captures, 1)
        XCTAssertEqual(f.hardware.removals, 0)
        await reopened.continueAfterResult(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertNil(reopened.saved)
        XCTAssertEqual(reopened.baseline?.enabled, true)
        let paths = await f.server.calls()
        XCTAssertFalse(
            paths.contains { $0.contains("notification-preferences") }, "Enrollment cannot enable private preferences")
    }

    func testPriorLogoutFencesEnrollmentBeforePermissionPrompt() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        try await f.store.stagePushLogout(actor: UUID(), session: UUID())
        await model.connect(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertNotNil(model.notice)
        XCTAssertNil(model.saved)
        XCTAssertEqual(f.hardware.asks, 0)
        XCTAssertEqual(f.hardware.captures, 0)
        let saves = await f.server.saves()
        XCTAssertTrue(saves.isEmpty)
    }

    func testOriginalSessionCannotBeResentUnderFreshSameActorSignInButCanBeCancelled() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        let context = try f.session.notificationContext()
        let baseline = try await f.session.readPushDevice(context)
        try await f.session.stagePushDevice(
            baseline: baseline, action: .register, bytes: Data([0, 4]), context: context)
        await f.auth.queueSessions([PushEnrollmentFixture.authenticated(member: f.member, session: UUID())])
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        await model.recover(session: f.session, member: f.member, hardware: f.hardware, retry: true)
        XCTAssertEqual(model.saved?.sessionId, f.sessionId)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        XCTAssertNotNil(model.notice)
        let saves = await f.server.saves()
        XCTAssertTrue(saves.isEmpty)
        await f.server.dropNextCancellationReply()
        await model.recover(session: f.session, member: f.member, hardware: f.hardware, cancel: true)
        XCTAssertEqual(model.saved?.cancellationRequested, true)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await model.recover(session: f.session, member: f.member, hardware: f.hardware, retry: true)
        XCTAssertEqual(model.saved?.result?.status, .cancelled)
        let finalSaves = await f.server.saves()
        XCTAssertTrue(finalSaves.isEmpty, "Durable cancellation must never dispatch the original register")
    }

    func testKnownDisableUnregistersOnlyAfterExactReceiptAndRemainsRecoverableWhenReplyLost() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        await f.server.rotate(enabled: true)
        let model = PushDeviceModel()
        await model.load(session: f.session, member: f.member, hardware: f.hardware)
        await f.server.dropNextSaveReply()
        await model.disconnect(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(model.saved?.command.action, .disable)
        XCTAssertNil(model.saved?.command.token)
        XCTAssertEqual(f.hardware.removals, 0)
        await model.recover(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        XCTAssertEqual(f.hardware.removals, 1)
        XCTAssertEqual(f.hardware.currentPermission, .allowed)
        XCTAssertEqual(f.hardware.asks, 0)
        await model.continueAfterResult(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(model.baseline?.enabled, false)
        let saves = await f.server.saves()
        XCTAssertEqual(saves.count, 1)
    }

    func testUnavailableCurrentReadPreservesOriginalRecoveryControls() async throws {
        let f = try await PushEnrollmentFixture.make(self)
        let first = PushDeviceModel()
        await first.load(session: f.session, member: f.member, hardware: f.hardware)
        await f.server.dropNextSaveReply()
        await first.connect(session: f.session, member: f.member, hardware: f.hardware)
        let command = try XCTUnwrap(first.saved?.command)
        await f.server.failDetailReads()
        let reopened = PushDeviceModel()
        await reopened.load(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(reopened.saved?.command, command)
        XCTAssertNil(reopened.baseline)
        XCTAssertNotNil(reopened.notice)
        await reopened.recover(session: f.session, member: f.member, hardware: f.hardware)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        let saves = await f.server.saves()
        XCTAssertEqual(saves, [command])
    }
}
