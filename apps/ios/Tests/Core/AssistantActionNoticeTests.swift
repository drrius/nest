import Foundation
import XCTest

@testable import NestCore

final class AssistantActionNoticeTests: XCTestCase {
    private func part(_ tool: String, value: [String: AssistantJSON]) -> [String: AssistantJSON] {
        [
            "type": .string("tool-\(tool)"), "state": .string("output-available"),
            "output": .object(["ok": .bool(true), "value": .object(value)]),
        ]
    }

    private var receipt: [String: AssistantJSON] {
        [
            "operation": .string(UUID().uuidString), "target": .string(UUID().uuidString),
            "version": .string("1"), "checked": .bool(true), "outcome": .string("applied"),
        ]
    }

    func testOnlyConfirmedValidGroceryReceiptsProduceSuccess() {
        var value = receipt
        XCTAssertEqual(AssistantActionNotice.text(part("checkGrocery", value: value)), "Grocery checked off.")
        for revision in ["0", "01", "9223372036854775808"] {
            value["version"] = .string(revision)
            XCTAssertNil(AssistantActionNotice.text(part("checkGrocery", value: value)))
        }
        value["version"] = .string("1")
        value["outcome"] = .string("pending")
        XCTAssertNil(AssistantActionNotice.text(part("checkGrocery", value: value)))
        value["outcome"] = .string("already_applied")
        value["checked"] = .bool(false)
        XCTAssertEqual(AssistantActionNotice.text(part("checkGrocery", value: value)), "Grocery marked as needed.")
        value["operation"] = .string("invalid")
        XCTAssertNil(AssistantActionNotice.text(part("checkGrocery", value: value)))
    }

    func testMutationReceiptsRequireTheExpectedRemovalState() {
        var value = receipt
        value["removed"] = .bool(false)
        XCTAssertEqual(AssistantActionNotice.text(part("addGrocery", value: value)), "Grocery added.")
        XCTAssertEqual(AssistantActionNotice.text(part("editGrocery", value: value)), "Grocery updated.")
        XCTAssertNil(AssistantActionNotice.text(part("removeGrocery", value: value)))
        value["removed"] = .bool(true)
        XCTAssertEqual(AssistantActionNotice.text(part("removeGrocery", value: value)), "Grocery removed.")
        XCTAssertNil(AssistantActionNotice.text(part("addGrocery", value: value)))
        XCTAssertNil(AssistantActionNotice.text(part("unknown", value: value)))
        var pending = part("checkGrocery", value: value)
        pending["state"] = .string("input-available")
        XCTAssertNil(AssistantActionNotice.text(pending))
    }

    func testFailedActionCannotBePresentedAsSuccess() {
        var failure = part("checkGrocery", value: receipt)
        failure["output"] = .object(["ok": .bool(false), "code": .string("conflict")])
        XCTAssertEqual(
            AssistantActionNotice.text(failure), "This item changed. Open it to review its current state.")
        failure["state"] = .string("output-error")
        XCTAssertEqual(
            AssistantActionNotice.text(failure),
            "This action could not be confirmed. Check its current state before retrying.")
    }
}
