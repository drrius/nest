import Foundation
import XCTest

@testable import NestCore

final class NestPushDestinationTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
    private let target = UUID()
    private let routes: [(NestPushDestination.Kind, String)] = [
        (.renewal, "renewalId"), (.chore, "occurrenceId"), (.meal, "entryId"),
        (.grocery, "itemId"), (.recurring, "ruleId"), (.dailySummary, "summaryId"),
    ]

    func testAllSixServerRoutingShapesRequireMatchingHouseholdAndTarget() throws {
        for (kind, key) in routes {
            let result = try decode(object(kind, key))
            XCTAssertEqual(result.kind, kind)
            XCTAssertEqual(result.targetId, target)
            XCTAssertEqual(result.recipientId, kind == .dailySummary ? member.userId : nil)
            XCTAssertEqual(try result.validated(member: member), result)
            let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
            XCTAssertThrowsError(try result.validated(member: foreign))
        }
    }

    func testPrivateSummaryCannotOpenForPartnerEvenInSameHousehold() throws {
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let result = try decode(object(.dailySummary, "summaryId"))
        XCTAssertThrowsError(try result.validated(member: partner))
        XCTAssertNoThrow(try decode(object(.chore, "occurrenceId")).validated(member: partner))
    }

    func testMissingOrExtraKeysCannotBecomeNavigationOrPrivateContent() throws {
        for (kind, key) in routes {
            let valid = object(kind, key)
            for missing in valid.keys {
                var changed = valid
                changed.removeValue(forKey: missing)
                XCTAssertThrowsError(try decode(changed))
            }
            for extra in ["url", "title", "body", "token", "command", "expenseId"] {
                var changed = valid
                changed[extra] = "untrusted"
                XCTAssertThrowsError(try decode(changed))
            }
            if kind != .dailySummary {
                var changed = valid
                changed["recipientId"] = member.userId.uuidString
                XCTAssertThrowsError(try decode(changed))
            }
        }
    }

    func testMalformedAndOversizedPayloadsFailClosed() throws {
        let valid = object(.renewal, "renewalId")
        let patches: [[String: Any]] = [
            ["version": 2], ["version": true], ["version": "1"], ["kind": "expense"],
            ["householdId": "not-a-uuid"], ["renewalId": NSNull()], ["renewalId": "https://example.invalid"],
        ]
        for patch in patches { XCTAssertThrowsError(try decode(valid.merging(patch) { _, new in new })) }
        for data in [Data(), Data("[]".utf8), Data("null".utf8), Data(repeating: 32, count: 4097)] {
            XCTAssertThrowsError(try NestPushDestination.decode(data))
        }
        var oversized = try JSONSerialization.data(withJSONObject: valid)
        oversized.append(Data(repeating: 32, count: 4097))
        XCTAssertThrowsError(try NestPushDestination.decode(oversized))
    }

    private func object(_ kind: NestPushDestination.Kind, _ key: String) -> [String: Any] {
        var value: [String: Any] = [
            "version": 1, "kind": kind.rawValue, "householdId": member.householdId.uuidString,
            key: target.uuidString,
        ]
        if kind == .dailySummary { value["recipientId"] = member.userId.uuidString }
        return value
    }

    private func decode(_ value: [String: Any]) throws -> NestPushDestination {
        try NestPushDestination.decode(JSONSerialization.data(withJSONObject: value))
    }
}
