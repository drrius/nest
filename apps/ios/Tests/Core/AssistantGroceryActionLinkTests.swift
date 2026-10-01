import Foundation
import XCTest

@testable import NestCore

final class AssistantGroceryActionLinkTests: XCTestCase {
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
            Bundle.module.url(forResource: "assistant-grocery-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testCanonicalGroceryReceiptsKeepHistoricalActionAndExactTarget() throws {
        let actions: [AssistantGroceryActionLink.Action] = [
            .added, .edited, .removed, .checked(true), .checked(true), .checked(false),
        ]
        for (index, fixture) in try fixtures().enumerated() {
            let link = try XCTUnwrap(AssistantGroceryActionLink.read(fixture.part))
            XCTAssertEqual(link.action, actions[index])
            XCTAssertEqual(link.itemId.uuidString.lowercased(), fixture.receipt["target"]?.string)
            XCTAssertEqual(link.version, fixture.receipt["version"]?.string)
        }
    }

    func testUnconfirmedPrivateNonceInjectedAndMalformedReceiptsGetNoLink() throws {
        for fixture in try fixtures() {
            var part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantGroceryActionLink.read(part))
            part = fixture.part
            part["output"] = .object(["ok": .bool(false), "value": .object(fixture.receipt)])
            XCTAssertNil(AssistantGroceryActionLink.read(part))
            for key in ["operationId", "offlineEpoch", "actorId", "householdId"] {
                var input = fixture.input
                input[key] = .string(UUID().uuidString)
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantGroceryActionLink.read(part), key)
            }
            for version in ["0", "01", "-1", "9223372036854775808", "١"] {
                var receipt = fixture.receipt
                receipt["version"] = .string(version)
                part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                XCTAssertNil(AssistantGroceryActionLink.read(part), version)
            }
        }
    }

    func testTargetRevisionFlagsAndDescriptionBoundaries() throws {
        for fixture in try fixtures().dropFirst() {
            for key in ["itemId", "expectedVersion"] {
                var input = fixture.input
                input[key] = .string(key == "itemId" ? UUID().uuidString : "44")
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantGroceryActionLink.read(part), fixture.type + key)
            }
        }
        let all = try fixtures()
        for fixture in all {
            var receipt = fixture.receipt
            if receipt["removed"] != nil {
                receipt["removed"] = .bool(receipt["removed"] != .bool(true))
            } else {
                receipt["checked"] = .bool(receipt["checked"] != .bool(true))
            }
            var part = fixture.part
            part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
            XCTAssertNil(AssistantGroceryActionLink.read(part))
        }
        let fixture = try XCTUnwrap(all.first)
        for name in ["\t\n", "A\0B", String(repeating: "a", count: 121)] {
            var input = fixture.input
            input["name"] = .string(name)
            var part = fixture.part
            part["input"] = .object(input)
            XCTAssertNil(AssistantGroceryActionLink.read(part))
        }
        var input = fixture.input
        input["name"] = .string(String(repeating: "🍎", count: 120))
        input["quantity"] = .string(String(repeating: "🍎", count: 80))
        var part = fixture.part
        part["input"] = .object(input)
        XCTAssertNotNil(AssistantGroceryActionLink.read(part))
        input["quantity"] = .string(String(repeating: "🍎", count: 81))
        part["input"] = .object(input)
        XCTAssertNil(AssistantGroceryActionLink.read(part))
    }
}
