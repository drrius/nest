import Foundation
import XCTest

@testable import Nest

@MainActor
final class PushDeviceAccountTests: XCTestCase {
    func testAccountChangeDuringAppleCaptureNeverStagesOrSends() async throws {
        for target in [false, true] {
            let f = try await PushEnrollmentFixture.make(self)
            let model = PushDeviceModel()
            await model.load(session: f.session, member: f.member, hardware: f.hardware)
            let partner = VerifiedMember(userId: UUID(), householdId: f.member.householdId, displayName: "Sam")
            f.hardware.beforeCapture = { try await f.switchPresentation(to: target ? partner : nil) }
            await model.connect(session: f.session, member: f.member, hardware: f.hardware)
            XCTAssertNil(model.saved)
            XCTAssertNil(model.baseline)
            let commands = await f.server.saves()
            let tracked = try await f.store.trackedPushSessions(actor: f.member.userId)
            XCTAssertTrue(commands.isEmpty)
            XCTAssertTrue(tracked.isEmpty)
        }
    }

    func testLateCommittedReplyCannotPublishAcrossGenerationEvenForSameActor() async throws {
        for sameActor in [false, true] {
            let f = try await PushEnrollmentFixture.make(self)
            let model = PushDeviceModel()
            await model.load(session: f.session, member: f.member, hardware: f.hardware)
            await f.server.holdNextSaveReply()
            let save = Task { await model.connect(session: f.session, member: f.member, hardware: f.hardware) }
            await f.server.waitForSave()
            let next =
                sameActor
                ? f.member
                : VerifiedMember(userId: UUID(), householdId: f.member.householdId, displayName: "Sam")
            try await f.switchPresentation(to: next)
            await f.server.releaseSave()
            await save.value
            XCTAssertNil(model.saved)
            XCTAssertNil(model.baseline)
            XCTAssertEqual(f.hardware.removals, 0)
            let nextContext = try f.session.notificationContext()
            let visible = try await f.session.savedPushDeviceRequest(nextContext)
            if sameActor {
                XCTAssertEqual(
                    visible?.result?.status, .unresolved, "Keep uncertainty until the original actor explicitly checks")
            } else {
                XCTAssertNil(visible)
                try await f.switchPresentation(to: f.member)
                let original = try await f.session.savedPushDeviceRequest(f.session.notificationContext())
                XCTAssertEqual(original?.result?.status, .unresolved)
            }
        }
    }
}
