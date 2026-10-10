import XCTest

@testable import NestCore

final class DailySummaryTests: XCTestCase {
    func testBoundedCountsAndPrivateHistoricalSnapshot() throws {
        for count in 0...1000 { try SummaryCount(count: count, more: false).validated() }
        try SummaryCount(count: 1000, more: true).validated()
        for count in [-1, 1001, Int.max] {
            XCTAssertThrowsError(try SummaryCount(count: count, more: false).validated())
        }
        XCTAssertThrowsError(try SummaryCount(count: 0, more: true).validated())
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let value = try snapshot(member)
        XCTAssertEqual(try value.validated(member: member, id: value.summaryId), value)
        XCTAssertThrowsError(try value.validated(member: member, id: UUID()))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try value.validated(member: partner))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
        XCTAssertThrowsError(try value.validated(member: foreign))
        XCTAssertEqual(value.summary.date.value, "2020-02-29", "Historical date must remain explicit")
    }

    func testAbsentSummaryAndNestedIdentityCannotBeConfused() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let empty = LatestDailySummary(
            version: 1, householdId: member.householdId,
            recipientId: member.userId, latest: nil)
        XCTAssertNil(try empty.validated(member: member).latest)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let swapped = LatestDailySummary(
            version: 1, householdId: member.householdId,
            recipientId: member.userId, latest: try snapshot(partner))
        XCTAssertThrowsError(try swapped.validated(member: member))
        let wrongVersion = LatestDailySummary(
            version: 2, householdId: member.householdId,
            recipientId: member.userId, latest: nil)
        XCTAssertThrowsError(try wrongVersion.validated(member: member))
    }

    func testAssistantSummaryLinksRequirePrivateValidatedFinishedRead() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let result = LatestDailySummary(
            version: 1, householdId: member.householdId,
            recipientId: member.userId, latest: try snapshot(member))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(result))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-readLatestDailySummary"),
            "state": .string("output-available"),
            "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantSummaryLink.read(part, member: member), .saved(result.latest!))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertNil(AssistantSummaryLink.read(part, member: partner))
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantSummaryLink.read(part, member: member))
        part["state"] = .string("output-available")
        part["type"] = .string("tool-readDailySummary")
        XCTAssertNil(AssistantSummaryLink.read(part, member: member))
    }

    private func snapshot(_ member: VerifiedMember) throws -> DailySummarySnapshot {
        let count = SummaryCount(count: 0, more: false)
        return .init(
            version: 1, summaryId: UUID(),
            summary: .init(
                version: 1, householdId: member.householdId, recipientId: member.userId,
                date: try CivilDate("2020-02-29"), choresDue: count, choresOverdue: count,
                mealsPlanned: count, renewalsDue: count, cancellationDeadlines: count))
    }
}
