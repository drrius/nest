import XCTest

@testable import NestCore

final class AssistantLiveTextTests: XCTestCase {
    func testSegmentsKeepTheirOrderAndCannotContinueAfterEnd() throws {
        var text = AssistantLiveText()
        try text.consume(.event(["type": .string("text-start"), "id": .string("one")]))
        try text.consume(.event(["type": .string("text-delta"), "id": .string("one"), "delta": .string("Hello 🌿")]))
        try text.consume(.event(["type": .string("text-end"), "id": .string("one")]))
        try text.consume(.event(["type": .string("text-start"), "id": .string("two")]))
        try text.consume(.event(["type": .string("text-delta"), "id": .string("two"), "delta": .string("Next")]))
        XCTAssertEqual(text.text, "Hello 🌿\n\nNext")
        XCTAssertThrowsError(
            try text.consume(.event(["type": .string("text-delta"), "id": .string("one"), "delta": .string("late")])))
        XCTAssertThrowsError(try text.consume(.event(["type": .string("text-start"), "id": .string("two")])))
    }

    func testOrphanDeltaAndProviderFailureAreNotSuccessfulText() throws {
        var text = AssistantLiveText()
        XCTAssertThrowsError(
            try text.consume(
                .event(["type": .string("text-delta"), "id": .string("missing"), "delta": .string("bad")])))
        for type in ["error", "abort"] {
            XCTAssertThrowsError(try text.consume(.event(["type": .string(type)])))
        }
        XCTAssertEqual(text.text, "")
    }
}
