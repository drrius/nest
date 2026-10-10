import Foundation
import XCTest

@testable import NestCore

final class AssistantActionNoticeTests: XCTestCase {
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
                forResource: "assistant-grocery-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testCanonicalGrocerySuccessBelongsOnlyToTypedRows() throws {
        for fixture in try fixtures() {
            XCTAssertNotNil(AssistantGroceryActionLink.read(fixture.part))
            XCTAssertNil(AssistantActionNotice.text(fixture.part))
        }
    }

    func testRejectedCommandBindingCannotRegainSuccessThroughFallback() throws {
        for fixture in try fixtures() {
            var input = fixture.input
            input["operationId"] = .string(UUID().uuidString)
            var part = fixture.part
            part["input"] = .object(input)
            XCTAssertNil(AssistantGroceryActionLink.read(part))
            XCTAssertNil(AssistantActionNotice.text(part))
            part = fixture.part
            part.removeValue(forKey: "input")
            XCTAssertNil(AssistantGroceryActionLink.read(part))
            XCTAssertNil(AssistantActionNotice.text(part))
            if fixture.input["itemId"] != nil {
                input = fixture.input
                input["itemId"] = .string(UUID().uuidString)
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantGroceryActionLink.read(part))
                XCTAssertNil(AssistantActionNotice.text(part))
            }
            part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantActionNotice.text(part))
        }
    }

    func testFailedActionCannotBePresentedAsSuccess() throws {
        var failure = try XCTUnwrap(fixtures().first).part
        failure["output"] = .object(["ok": .bool(false), "code": .string("conflict")])
        XCTAssertEqual(
            AssistantActionNotice.text(failure), "This item changed. Open it to review its current state.")
        failure["state"] = .string("output-error")
        XCTAssertEqual(
            AssistantActionNotice.text(failure),
            "This action could not be confirmed. Check its current state before retrying.")
    }
}
