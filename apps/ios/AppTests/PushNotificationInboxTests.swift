import Foundation
import XCTest

@testable import Nest

@MainActor
final class PushNotificationInboxTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")

    func testColdTapWaitsForVerifiedAccountAndIsConsumedOnlyOnce() throws {
        let inbox = PushNotificationInbox()
        let data = try payload(member)
        inbox.receive(data)
        XCTAssertNotNil(inbox.pending)
        XCTAssertNil(inbox.take(member: member))
        XCTAssertNotNil(inbox.pending)
        inbox.bind(member)
        XCTAssertEqual(inbox.take(member: member), try NestPushDestination.decode(data))
        XCTAssertNil(inbox.take(member: member))
    }

    func testColdPrivateSummaryAndForeignHouseholdAreDroppedForWrongAccount() throws {
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
        for next in [partner, foreign] {
            let inbox = PushNotificationInbox()
            inbox.receive(try payload(member, summary: true))
            inbox.bind(next)
            XCTAssertNil(inbox.take(member: next))
            XCTAssertNil(inbox.pending)
        }
    }

    func testSignOutDropsPendingAndRejectsNewTapsUntilAnotherAccountRestore() throws {
        let inbox = PushNotificationInbox()
        inbox.bind(member)
        inbox.receive(try payload(member))
        inbox.signedOut()
        XCTAssertNil(inbox.pending)
        inbox.receive(try payload(member))
        XCTAssertNil(inbox.pending)
        inbox.bind(member)
        XCTAssertNil(inbox.take(member: member))
        inbox.receive(try payload(member))
        inbox.bind(nil)
        XCTAssertNil(inbox.pending)
    }

    func testNewTapWaitsSeparatelyAndMalformedTapCannotReplaceValidPending() throws {
        let inbox = PushNotificationInbox()
        inbox.bind(member)
        inbox.receive(try payload(member))
        let opening = try XCTUnwrap(inbox.take(member: member))
        let nextData = try payload(member)
        inbox.receive(nextData)
        inbox.receive(Data("{\"url\":\"untrusted\"}".utf8))
        XCTAssertEqual(inbox.pending, try NestPushDestination.decode(nextData))
        XCTAssertNotEqual(opening, inbox.pending)
        XCTAssertEqual(inbox.take(member: member), try NestPushDestination.decode(nextData))
    }

    func testForegroundPresentationRequiresMatchingVerifiedAccountAndPrivateRecipient() throws {
        let inbox = PushNotificationInbox()
        let ownSummary = try payload(member, summary: true)
        XCTAssertFalse(inbox.mayPresent(ownSummary))
        inbox.bind(member)
        XCTAssertTrue(inbox.mayPresent(ownSummary))
        XCTAssertNil(inbox.pending, "Foreground delivery must not navigate without a tap")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertFalse(inbox.mayPresent(try payload(partner, summary: true)))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
        XCTAssertFalse(inbox.mayPresent(try payload(foreign)))
        inbox.signedOut()
        XCTAssertFalse(inbox.mayPresent(ownSummary))
    }

    private func payload(_ member: VerifiedMember, summary: Bool = false) throws -> Data {
        var value: [String: Any] = [
            "version": 1, "kind": summary ? "daily_summary" : "renewal",
            "householdId": member.householdId.uuidString,
            summary ? "summaryId" : "renewalId": UUID().uuidString,
        ]
        if summary { value["recipientId"] = member.userId.uuidString }
        return try JSONSerialization.data(withJSONObject: value)
    }
}
