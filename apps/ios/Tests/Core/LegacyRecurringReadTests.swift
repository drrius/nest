import Foundation
import XCTest

@testable import NestCore

final class LegacyRecurringReadTests: XCTestCase {
    private let member = VerifiedMember(
        userId: LegacyRecurringReadTests.id(1), householdId: LegacyRecurringReadTests.id(10), displayName: "Alex")
    private static func id(_ value: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", value))!
    }
    private func fixture(_ key: String) throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "legacy-recurring-read", withExtension: "json", subdirectory: "Fixtures"))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        return try XCTUnwrap(object[key] as? [String: Any])
    }
    private func rules(_ raw: [String: Any], after: UUID? = nil) throws -> LegacyRecurringList {
        let value = try JSONDecoder().decode(
            LegacyRecurringList.self, from: JSONSerialization.data(withJSONObject: raw))
        return try value.validated(member: member, after: after)
    }
    private func drafts(_ raw: [String: Any], after: UUID? = nil) throws -> LegacyDraftList {
        let value = try JSONDecoder().decode(LegacyDraftList.self, from: JSONSerialization.data(withJSONObject: raw))
        return try value.validated(member: member, ruleId: Self.id(800), after: after)
    }

    func testRetainedTermsKeepExactCentimesVersionsAndUnsupportedValues() throws {
        var page = try fixture("rules")
        let row = try XCTUnwrap(rules(page).rules.first)
        XCTAssertEqual(row.amountCentimes.value, 9_007_199_254_740_991)
        XCTAssertEqual(row.allocations.shares?.last?.centimes.value, 4_503_599_627_370_496)
        XCTAssertEqual(row.updatedAt.value, "2026-01-01T10:00:00.123456Z")
        var raw = try XCTUnwrap((page["rules"] as? [[String: Any]])?.first)
        raw["description"] = "\t"
        raw["allocations"] = ["kind": "needs_review", "reason": "invalid_split"]
        raw["nextOccurrenceOn"] = ["kind": "unsupported", "reason": "non_finite", "value": "infinity"]
        raw["updatedAt"] = ["kind": "unsupported", "reason": "out_of_range", "value": "99999-01-01"]
        page["rules"] = [raw]
        let retained = try XCTUnwrap(rules(page).rules.first)
        XCTAssertEqual(retained.description, "\t")
        XCTAssertEqual(retained.nextOccurrenceOn.value, "infinity")
        XCTAssertEqual(retained.allocations.kind, .needsReview)
        XCTAssertTrue(retained.needsReview)
        XCTAssertEqual(LegacyRecurringLabel.display(retained.description), "Retained recurring expense")
        for label in ["", "   ", "a\0b", String(repeating: "a", count: 201)] {
            raw["description"] = label
            page["rules"] = [raw]
            XCTAssertThrowsError(try rules(page))
        }
    }

    func testDraftTermsAreIndependentAndInconsistentStatusesRemainVisible() throws {
        var page = try fixture("drafts")
        var row = try XCTUnwrap((page["drafts"] as? [[String: Any]])?.first)
        row["eventId"] = Self.id(950).uuidString.lowercased()
        for status in ["pending", "dismissed", "posted"] {
            row["status"] = status
            page["drafts"] = [row]
            let draft = try XCTUnwrap(drafts(page).drafts.first)
            XCTAssertEqual(draft.description, "Original draft")
            XCTAssertEqual(draft.amountCentimes?.value, 9_007_199_254_740_991)
            XCTAssertEqual(draft.needsReconciliation, status != "posted")
        }
        row["eventId"] = NSNull()
        page["drafts"] = [row]
        XCTAssertTrue(try XCTUnwrap(drafts(page).drafts.first).needsReconciliation)
        row["amountCentimes"] = NSNull()
        row["payerId"] = NSNull()
        page["drafts"] = [row]
        XCTAssertThrowsError(try drafts(page))
        row["allocations"] = ["kind": "needs_review", "reason": "invalid_split"]
        row["sourceKind"] = "shopping"
        row["shoppingSessionId"] = Self.id(960).uuidString.lowercased()
        page["drafts"] = [row]
        XCTAssertEqual(try drafts(page).drafts.first?.sourceKind, .shopping)
        row["shoppingSessionId"] = NSNull()
        page["drafts"] = [row]
        XCTAssertThrowsError(try drafts(page))
    }

    func testInventoryAndDraftPaginationRejectScopeCursorOrderAndLimitSubstitution() throws {
        for key in ["rules", "drafts"] {
            var page = try fixture(key)
            let validate: ([String: Any]) throws -> Void = { raw in
                if key == "rules" { _ = try self.rules(raw) } else { _ = try self.drafts(raw) }
            }
            for field in ["householdId", "after"] {
                page[field] = Self.id(999).uuidString.lowercased()
                XCTAssertThrowsError(try validate(page))
                page = try fixture(key)
            }
            let row = try XCTUnwrap((page[key] as? [[String: Any]])?.first)
            page[key] = [row, row]
            XCTAssertThrowsError(try validate(page))
            page[key] = Array(repeating: row, count: 21)
            XCTAssertThrowsError(try validate(page))
            page[key] = [row]
            page["next"] = Self.id(999).uuidString.lowercased()
            XCTAssertThrowsError(try validate(page))
        }
        var page = try fixture("drafts")
        page["ruleId"] = Self.id(801).uuidString.lowercased()
        XCTAssertThrowsError(try drafts(page))
        var row = try XCTUnwrap((page["drafts"] as? [[String: Any]])?.first)
        page["ruleId"] = Self.id(800).uuidString.lowercased()
        row["ruleId"] = Self.id(801).uuidString.lowercased()
        page["drafts"] = [row]
        XCTAssertThrowsError(try drafts(page))
    }

    func testAssistantReadLinksBindExactQueryHouseholdAndHistoricalPage() throws {
        for key in ["rules", "drafts"] {
            let page = try fixture(key)
            let data = try JSONSerialization.data(withJSONObject: page)
            let value = try JSONDecoder().decode(AssistantJSON.self, from: data)
            let type = key == "rules" ? "tool-listLegacyRecurringRules" : "tool-listLegacyRecurringDrafts"
            var input: [String: AssistantJSON] = ["after": .null]
            if key == "drafts" { input["ruleId"] = .string(Self.id(800).uuidString.lowercased()) }
            var part: [String: AssistantJSON] = [
                "type": .string(type), "state": .string("output-available"), "input": .object(input),
                "output": .object(["ok": .bool(true), "value": value]),
            ]
            let expected: AssistantLegacyRecurringLink = key == "rules" ? .rules : .drafts(Self.id(800))
            XCTAssertEqual(AssistantLegacyRecurringLink.read(part, member: member), expected)
            input["after"] = .string(Self.id(999).uuidString.lowercased())
            part["input"] = .object(input)
            XCTAssertNil(AssistantLegacyRecurringLink.read(part, member: member))
            input["after"] = .null
            input["actorId"] = .string(member.userId.uuidString.lowercased())
            part["input"] = .object(input)
            XCTAssertNil(AssistantLegacyRecurringLink.read(part, member: member))
            input.removeValue(forKey: "actorId")
            part["input"] = .object(input)
            let outsider = VerifiedMember(userId: Self.id(3), householdId: Self.id(20), displayName: "Outsider")
            XCTAssertNil(AssistantLegacyRecurringLink.read(part, member: outsider))
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantLegacyRecurringLink.read(part, member: member))
            part["state"] = .string("output-available")
            part["output"] = .object(["ok": .bool(false), "value": value])
            XCTAssertNil(AssistantLegacyRecurringLink.read(part, member: member))
        }
    }

    func testCountInvariantsHandleNineteenDigitsAndGeneratedSumsWithoutOverflow() throws {
        var page = try fixture("rules")
        var row = try XCTUnwrap((page["rules"] as? [[String: Any]])?.first)
        var counts = try XCTUnwrap(row["drafts"] as? [String: Any])
        for field in ["pending", "posted", "dismissed", "postedWithoutEvent", "unpostedWithEvent", "unsupportedDates"] {
            counts[field] = "9999999999999999999"
        }
        row["drafts"] = counts
        page["rules"] = [row]
        XCTAssertTrue(try XCTUnwrap(rules(page).rules.first).drafts.valid)
        for text in ["-1", "01", "+1", "10000000000000000000", "1.0"] {
            counts["pending"] = text
            row["drafts"] = counts
            page["rules"] = [row]
            XCTAssertThrowsError(try rules(page))
        }
        for seed in 0..<128 {
            let pending = UInt64(seed) * 73
            let posted = UInt64(seed) * 19
            let dismissed = UInt64(seed) * 11
            let total = pending + posted + dismissed
            let value = LegacyDraftCounts(
                pending: String(pending), posted: String(posted), dismissed: String(dismissed),
                postedWithoutEvent: String(posted), unpostedWithEvent: String(pending + dismissed),
                unsupportedDates: String(total),
                latestDraftOn: total == 0 ? nil : .init(kind: .date, value: "2026-01-05", reason: nil))
            XCTAssertTrue(value.valid, "seed \(seed)")
            XCTAssertFalse(
                LegacyDraftCounts(
                    pending: value.pending, posted: value.posted, dismissed: value.dismissed,
                    postedWithoutEvent: String(posted + 1), unpostedWithEvent: "0", unsupportedDates: "0",
                    latestDraftOn: value.latestDraftOn).valid
            )
        }
    }
}
