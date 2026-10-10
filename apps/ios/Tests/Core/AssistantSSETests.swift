import XCTest

@testable import NestCore

final class AssistantSSETests: XCTestCase {
    func testTextAndStructuredFramesRequireExplicitDone() throws {
        var parser = AssistantSSE()
        XCTAssertNil(try parser.consume(line: ": keep-alive"))
        XCTAssertNil(try parser.consume(line: "data: {\"type\":\"text-delta\","))
        XCTAssertNil(try parser.consume(line: "data: \"id\":\"text-1\",\"delta\":\"Hello 🌿\"}"))
        XCTAssertEqual(
            try parser.consume(line: ""),
            .event(["type": .string("text-delta"), "id": .string("text-1"), "delta": .string("Hello 🌿")]))
        XCTAssertThrowsError(try parser.finish())
        XCTAssertNil(try parser.consume(line: "data: [DONE]"))
        XCTAssertEqual(try parser.consume(line: ""), .done)
        XCTAssertNoThrow(try parser.finish())
        XCTAssertThrowsError(try parser.consume(line: "data: {}"))
    }

    func testTruncationMalformedFramesAndByteLimitFailClosed() throws {
        var truncated = AssistantSSE()
        _ = try truncated.consume(line: "data: [DONE]")
        XCTAssertThrowsError(try truncated.finish())
        var malformed = AssistantSSE()
        _ = try malformed.consume(line: "data: {\"type\":true}")
        XCTAssertThrowsError(try malformed.consume(line: ""))
        var limited = AssistantSSE(maximumBytes: 10)
        XCTAssertThrowsError(try limited.consume(line: "data: 🌿🌿"))
    }
}
