import Foundation
import XCTest

@testable import NestCore

final class AssistantMealActionLinkTests: XCTestCase {
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
            Bundle.module.url(forResource: "assistant-meal-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testCanonicalReceiptsOpenCorrectNewCurrentOrRemovedTarget() throws {
        let actions: [AssistantMealActionLink.Action] = [
            .placed, .savedRecipe, .replaced, .removed, .moved, .moved, .leftovers, .leftovers,
        ]
        for (index, fixture) in try fixtures().enumerated() {
            let link = try XCTUnwrap(AssistantMealActionLink.read(fixture.part, member: member), fixture.type)
            XCTAssertEqual(link.action, actions[index])
            XCTAssertEqual(link.entryId.uuidString.lowercased(), fixture.receipt["entryId"]?.string)
            XCTAssertEqual(
                link.weekStart.date.value,
                fixture.receipt["targetWeekStart"]?.string ?? fixture.receipt["weekStart"]?.string)
        }
    }

    func testEveryActionRejectsForeignScopeNoncePendingAndFailedParts() throws {
        for fixture in try fixtures() {
            for key in ["actorId", "householdId", "operationId"] {
                var receipt = fixture.receipt
                receipt[key] = .string(UUID().uuidString)
                var part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                if key == "operationId" {
                    // The provider cannot supply the private invocation nonce; reject injected input.
                    var input = fixture.input
                    input["operationId"] = fixture.receipt["operationId"]
                    part["input"] = .object(input)
                }
                XCTAssertNil(AssistantMealActionLink.read(part, member: member), fixture.type + key)
            }
            var part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantMealActionLink.read(part, member: member))
            part = fixture.part
            part["output"] = .object(["ok": .bool(false), "value": .object(fixture.receipt)])
            XCTAssertNil(AssistantMealActionLink.read(part, member: member))
            part = fixture.part
            part.removeValue(forKey: "input")
            XCTAssertNil(AssistantMealActionLink.read(part, member: member))
        }
    }

    func testCommandTargetDateLibraryAndRevisionTamperingCannotOpenARecord() throws {
        for fixture in try fixtures() {
            for (key, value) in fixture.input {
                var input = fixture.input
                switch key {
                case "title": continue  // Receipt binds target identity, not retained current text.
                case "slot": input[key] = .string(value == .string("lunch") ? "dinner" : "lunch")
                case "date": input[key] = .string("2026-11-30")
                case "weekStart", "sourceWeekStart", "targetWeekStart": input[key] = .string("2026-11-30")
                case "expectedRevision", "expectedSourceRevision", "expectedTargetRevision", "expectedLibraryRevision":
                    input[key] = .string("-1")
                default: input[key] = .string(UUID().uuidString)
                }
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantMealActionLink.read(part, member: member), fixture.type + key)
            }
        }
    }
}
