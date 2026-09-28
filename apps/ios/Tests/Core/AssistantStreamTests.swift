import XCTest

@testable import NestCore

final class AssistantStreamTests: XCTestCase {
    func testByteStreamPreservesUnicodeAndRejectsTruncatedOrInvalidUTF8() throws {
        var decoder = AssistantStreamBytes()
        var frames: [AssistantStreamFrame] = []
        for byte in "data: {\"type\":\"text-delta\",\"delta\":\"🌿\"}\r\n\r\ndata: [DONE]\r\n\r\n".utf8 {
            if let frame = try decoder.consume(byte) { frames.append(frame) }
        }
        try decoder.finish()
        XCTAssertEqual(frames, [.event(["type": .string("text-delta"), "delta": .string("🌿")]), .done])
        var invalid = AssistantStreamBytes()
        _ = try invalid.consume(255)
        XCTAssertThrowsError(try invalid.consume(10))
        var truncated = AssistantStreamBytes()
        for byte in "data: [DONE]\n".utf8 { _ = try truncated.consume(byte) }
        XCTAssertThrowsError(try truncated.finish())
    }

    func testRequestRetainsIdentityAndRequiresSDKStreamResponse() throws {
        let api = AssistantAPI(http: try NestHTTP(baseURL: URL(string: "https://nest.example")!))
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "Hello")
        let household = UUID()
        let request = try api.streamRequest(command: command, token: "fixture", household: household)
        XCTAssertEqual(try JSONDecoder().decode(StartAssistantTurn.self, from: XCTUnwrap(request.httpBody)), command)
        XCTAssertEqual(request.url?.path, "/v1/assistant/turn")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), household.uuidString.lowercased())
        for status in [200, 302, 401, 403, 409, 503] {
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status, httpVersion: nil,
                headerFields: [
                    "Content-Type": "text/event-stream; charset=utf-8", "x-vercel-ai-ui-message-stream": "v1",
                ])!
            if status == 200 {
                XCTAssertNoThrow(try AssistantAPI.validateStreamResponse(response))
            } else {
                XCTAssertThrowsError(try AssistantAPI.validateStreamResponse(response))
            }
        }
        let html = HTTPURLResponse(
            url: request.url!, statusCode: 200, httpVersion: nil,
            headerFields: ["Content-Type": "text/html"])!
        XCTAssertThrowsError(try AssistantAPI.validateStreamResponse(html))
    }
}
