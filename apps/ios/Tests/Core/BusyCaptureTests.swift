import Foundation
import XCTest

@testable import NestCore

final class BusyCaptureTests: XCTestCase {
    func testCaptureBindsConsentAndFifteenMinuteLease() throws {
        let command = BeginBusyCapture(incarnation: UUID(), consent: "2")
        let capture = BusyCapture(
            incarnation: command.incarnation, consent: "2", generation: "3",
            capturedAt: "2026-09-28T12:00:00Z", expiresAt: "2026-09-28T12:15:00Z")
        XCTAssertEqual(try capture.validated(command: command).generation, "3")
        XCTAssertThrowsError(try capture.validated(command: .init(incarnation: command.incarnation, consent: "3")))
        XCTAssertThrowsError(
            try BusyCapture(
                incarnation: command.incarnation, consent: "2", generation: "3",
                capturedAt: capture.capturedAt, expiresAt: "2026-09-28T12:16:00Z"
            ).validated(command: command))
        XCTAssertThrowsError(try BusyCapture.timestamp("2026-09-28T12:00:00"))
    }

    func testPublishReceiptRejectsOtherOwnerAndGeneration() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let incarnation = UUID()
        let capture = BusyCapture(
            incarnation: incarnation, consent: "2", generation: "3",
            capturedAt: "2026-09-28T12:00:00Z", expiresAt: "2026-09-28T12:15:00Z")
        let command = PublishBusy(
            incarnation: incarnation, consent: "2", generation: "3",
            covered: .init(start: 100, end: 200), intervals: [])
        let receipt = BusyPublishReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            incarnation: incarnation, consent: "2", generation: "3", expiresAt: capture.expiresAt)
        _ = try receipt.validated(member: member, command: command, capture: capture)
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try receipt.validated(member: outsider, command: command, capture: capture))
        let altered = PublishBusy(
            incarnation: incarnation, consent: "2", generation: "4",
            covered: command.covered, intervals: [])
        XCTAssertThrowsError(try receipt.validated(member: member, command: altered, capture: capture))
    }

    func testPublishRejectsUnmergedOutOfRangeAndExcessiveIntervals() throws {
        let incarnation = UUID()
        func command(_ intervals: [BusyInterval]) -> PublishBusy {
            .init(
                incarnation: incarnation, consent: "2", generation: "3",
                covered: .init(start: 100, end: 2000), intervals: intervals)
        }
        _ = try command([.init(start: 100, end: 200), .init(start: 201, end: 300)]).validated()
        let excessive: [BusyInterval] = (0..<513).map { index in
            let start = Int64(100 + index * 3)
            return BusyInterval(start: start, end: start + 1)
        }
        let invalid: [[BusyInterval]] = [
            [BusyInterval(start: 100, end: 200), .init(start: 200, end: 300)],
            [.init(start: 99, end: 200)], [.init(start: 200, end: 2001)],
            excessive,
        ]
        for intervals in invalid {
            XCTAssertThrowsError(try command(intervals).validated())
        }
    }
}
