import Foundation
import XCTest

@testable import NestCore

final class AssistantPreferenceLinkTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Fixture")

    private struct Fixture: Decodable {
        let type: String
        let input: [String: AssistantJSON]
        let receipt: [String: AssistantJSON]
        var part: [String: AssistantJSON] {
            [
                "type": .string(type), "state": .string("output-available"), "input": .object(input),
                "output": .object(["ok": .bool(true), "value": .object(receipt)]),
            ]
        }
    }

    private func fixtures() throws -> [Fixture] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-preference-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testIssuedTypedReceiptsIncludeNullableGoalAndBigintRevision() throws {
        for fixture in try fixtures() {
            let result = try XCTUnwrap(AssistantPreferenceLink.read(fixture.part, member: member))
            switch result {
            case .food(let receipt):
                XCTAssertEqual(fixture.type, "tool-saveFoodPreferences")
                XCTAssertEqual(receipt.revision, fixture.receipt["revision"]?.string)
            case .cooking: XCTAssertEqual(fixture.type, "tool-saveCookingPreferences")
            case .notifications: XCTAssertEqual(fixture.type, "tool-saveNotificationPreferences")
            case .removedMemory(let receipt):
                XCTAssertEqual(fixture.type, "tool-removeMemory")
                XCTAssertTrue(receipt.removed)
                XCTAssertEqual(receipt.memoryId.uuidString.lowercased(), fixture.input["memoryId"]?.string)
            }
        }
    }

    func testPendingFailedForeignScopeAndModelNonceInjectionHaveNoLink() throws {
        for fixture in try fixtures() {
            var part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            part = fixture.part
            part["output"] = .object(["ok": .bool(false), "value": .object(fixture.receipt)])
            XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            for key in ["operationId", "offlineEpoch", "actorId", "householdId"] {
                var input = fixture.input
                input[key] = .string(UUID().uuidString)
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            }
            for key in ["actorId", "householdId", "operationId"] {
                var receipt = fixture.receipt
                receipt[key] = .string(key == "operationId" ? "not-a-uuid" : UUID().uuidString)
                part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            }
        }
    }

    func testExactRevisionMemoryTargetAndStrictPreferenceFields() throws {
        for fixture in try fixtures() {
            for revision in ["01", "-1", "9223372036854775807"] {
                var input = fixture.input
                input["expectedRevision"] = .string(revision)
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            }
            var receipt = fixture.receipt
            receipt["revision"] = fixture.input["expectedRevision"]
            var part = fixture.part
            part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
            XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            if case .object(let preferences) = fixture.input["preferences"] {
                for key in preferences.keys {
                    var values = preferences
                    values.removeValue(forKey: key)
                    var input = fixture.input
                    input["preferences"] = .object(values)
                    part = fixture.part
                    part["input"] = .object(input)
                    XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
                }
                var values = preferences
                values["bankAccount"] = .string("unapproved")
                var input = fixture.input
                input["preferences"] = .object(values)
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            } else {
                receipt = fixture.receipt
                receipt["removed"] = .bool(false)
                part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
                receipt = fixture.receipt
                receipt["memoryId"] = .string(UUID().uuidString)
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
                var input = fixture.input
                input["expectedRevision"] = .string("0")
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member))
            }
        }
    }

    func testInvalidDietSlotsAndNotificationChoicesCannotRenderSuccess() throws {
        for fixture in try fixtures() {
            guard case .object(let original) = fixture.input["preferences"] else { continue }
            let mutations: [(String, AssistantJSON)]
            switch fixture.type {
            case "tool-saveFoodPreferences":
                mutations = [
                    ("restrictions", .array([.string("  ")])), ("calorieGoal", .number(20001)),
                    ("portions", .number(1.25)),
                ]
            case "tool-saveCookingPreferences":
                mutations = [
                    ("mealSlots", .array([])), ("mealSlots", .array([.string("dinner"), .string("dinner")])),
                    ("cookingNotes", .string("Invalid\0notes")),
                ]
            default:
                mutations = [("dailySummaryTime", .string("24:00")), ("dailySummaryEnabled", .string("true"))]
            }
            for (key, invalid) in mutations {
                var preferences = original
                preferences[key] = invalid
                var input = fixture.input
                input["preferences"] = .object(preferences)
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantPreferenceLink.read(part, member: member), key)
            }
        }
    }

}
