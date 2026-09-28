import Foundation
import XCTest

@testable import NestCore

final class CalendarConsentStoreTests: XCTestCase {
    func testUncertainConsentSurvivesReopenAndRequiresExactReceipt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "calendar-consent-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let current = CalendarConsent(incarnation: UUID(), version: "4", enabled: true)
        let operation = UUID()
        try await store.enqueueCalendarConsentChange(
            current: current, enabled: false, operation: operation, lease: lease)
        do {
            try await store.discardRejectedCalendarConsentChange(lease: lease)
            XCTFail("Forgot uncertain opt-out")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.enqueueCalendarConsentChange(
                current: current, enabled: true, operation: UUID(), lease: lease)
            XCTFail("Replaced uncertain opt-out")
        } catch OfflineFailure.invalidOperation {}
        let reopened = try ChoreOfflineStore(url: url)
        let restored = try await reopened.activate(member)
        let retained = try await reopened.readCalendarConsentChange(lease: restored)
        XCTAssertEqual(retained?.command.operationId, operation)
        XCTAssertEqual(retained?.command.enabled, false)
        let receipt = CalendarConsentReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId, operationId: UUID(),
            consent: .init(incarnation: current.incarnation, version: "5", enabled: false))
        do {
            try await reopened.confirmCalendarConsentChange(receipt, lease: restored)
            XCTFail("Accepted another operation")
        } catch CalendarConsentError.invalid {}
        try await reopened.confirmCalendarConsentChange(
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId, operationId: operation,
                consent: receipt.consent), lease: restored)
        let cleared = try await reopened.readCalendarConsentChange(lease: restored)
        XCTAssertNil(cleared)
    }
}
