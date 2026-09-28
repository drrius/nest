import Foundation
import XCTest

@testable import NestCore

final class CalendarSelectionStoreTests: XCTestCase {
    @MainActor
    func testReopenSeparatesMembersAndHouseholdsAndClearsSelection() throws {
        let suite = "calendar-selection-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let first = CalendarSelectionStore(member: member, defaults: defaults)
        first.save(["device-calendar-id"])
        let reopened = CalendarSelectionStore(member: member, defaults: defaults)
        XCTAssertEqual(reopened.read(), ["device-calendar-id"])
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertTrue(CalendarSelectionStore(member: partner, defaults: defaults).read().isEmpty)
        let moved = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Test")
        XCTAssertTrue(CalendarSelectionStore(member: moved, defaults: defaults).read().isEmpty)
        reopened.save([])
        XCTAssertTrue(first.read().isEmpty)
    }
}
