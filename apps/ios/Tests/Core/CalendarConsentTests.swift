import Foundation
import XCTest

@testable import NestCore

final class CalendarConsentTests: XCTestCase {
    func testConsentReceiptBindsOwnerOperationRevisionAndChoice() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = SetCalendarConsent(
            incarnation: UUID(), operationId: UUID(), expectedRevision: "4", enabled: false)
        let consent = CalendarConsent(incarnation: command.incarnation, version: "5", enabled: false)
        let receipt = CalendarConsentReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, consent: consent)
        XCTAssertEqual(try receipt.validated(member: member, command: command), consent)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt.validated(member: partner, command: command))
        for altered in [
            SetCalendarConsent(
                incarnation: UUID(), operationId: command.operationId, expectedRevision: "4", enabled: false),
            SetCalendarConsent(
                incarnation: command.incarnation, operationId: UUID(), expectedRevision: "4", enabled: false),
            SetCalendarConsent(
                incarnation: command.incarnation, operationId: command.operationId, expectedRevision: "3",
                enabled: false),
            SetCalendarConsent(
                incarnation: command.incarnation, operationId: command.operationId, expectedRevision: "4", enabled: true
            ),
        ] {
            XCTAssertThrowsError(try receipt.validated(member: member, command: altered))
        }
    }

    func testRevisionRejectsNoncanonicalAndOverflowValues() {
        for value in ["-1", "01", "+1", "1.0", "", String(Int64.max)] {
            XCTAssertThrowsError(
                try SetCalendarConsent(
                    incarnation: UUID(), operationId: UUID(), expectedRevision: value, enabled: true
                ).validated())
        }
    }
}
