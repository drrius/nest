import Foundation
import XCTest

@testable import NestCore

final class NotificationPreferenceTests: XCTestCase {
    func testSummaryTimeRequiresExactCivilClockTime() throws {
        for time in ["00:00", "07:30", "23:59"] {
            XCTAssertNoThrow(
                try NotificationPreferences(
                    dailySummaryEnabled: true, dailySummaryTime: time, itemRemindersEnabled: false).validated())
        }
        for time in ["24:00", "7:30", "07:60", "07:30\n", " 07:30", "０７:３０"] {
            XCTAssertThrowsError(
                try NotificationPreferences(
                    dailySummaryEnabled: false, dailySummaryTime: time, itemRemindersEnabled: true).validated())
        }
    }

    func testMissingProfileIsNotOptInAndForeignProfilesAreRejected() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        func envelope(actor: UUID, zone: String = "Europe/Zurich") -> NotificationProfileEnvelope {
            .init(version: 1, actorId: actor, householdId: member.householdId, timeZone: zone, profile: nil)
        }
        XCTAssertNil(try envelope(actor: member.userId).validated(member: member).profile)
        XCTAssertThrowsError(try envelope(actor: UUID()).validated(member: member))
        XCTAssertThrowsError(try envelope(actor: member.userId, zone: "UTC").validated(member: member))
    }

    func testReceiptBindsActorOperationAndExactNextRevision() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: "2",
            preferences: .init(dailySummaryEnabled: false, dailySummaryTime: "07:30", itemRemindersEnabled: false))
        func receipt(operation: UUID, revision: String) -> NotificationPreferenceReceipt {
            .init(actorId: member.userId, householdId: member.householdId, operationId: operation, revision: revision)
        }
        XCTAssertNoThrow(
            try receipt(operation: command.operationId, revision: "3").validated(member: member, command: command))
        XCTAssertThrowsError(try receipt(operation: UUID(), revision: "3").validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt(operation: command.operationId, revision: "4").validated(member: member, command: command))
        let overflow = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: "9223372036854775807", preferences: command.preferences)
        XCTAssertThrowsError(try overflow.validated())
    }
}
