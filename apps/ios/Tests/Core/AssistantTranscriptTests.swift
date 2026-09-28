import Foundation
import XCTest

@testable import NestCore

final class AssistantTranscriptTests: XCTestCase {
    func testTranscriptPreservesStructuredToolsAndRejectsWrongConversation() throws {
        let id = UUID()
        let json = """
            {"version":1,"conversation":{"conversationId":"\(id)","revision":"2","messages":[
              {"id":"assistant-message","role":"assistant","parts":[
                {"type":"text","text":"Please review the proposal."},
                {"type":"tool-proposeExpense","state":"output-available","toolCallId":"call-1",
                 "output":{"ok":true,"centimes":9007199254740993,"approvalId":"test-approval"}}
              ]}]}}
            """
        let value = try JSONDecoder().decode(AssistantTranscriptEnvelope.self, from: Data(json.utf8))
        _ = try value.validated(id: id)
        let part = try XCTUnwrap(value.conversation?.messages.first?.parts.last)
        XCTAssertEqual(part["state"], .string("output-available"))
        guard case .object(let output) = part["output"] else { return XCTFail("Tool payload lost") }
        XCTAssertEqual(output["approvalId"], .string("test-approval"))
        XCTAssertEqual(output["centimes"], .number(Decimal(string: "9007199254740993")!))
        XCTAssertThrowsError(try value.validated(id: UUID()))
    }

    func testLargeTranscriptReadKeepsOrdinaryHTTPBoundAndRejectsUnboundedOverride() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let id = UUID()
        let text = String(repeating: "a", count: 1_100_000)
        let json = """
            {"version":1,"conversation":{"conversationId":"\(id)","revision":"1","messages":[
              {"id":"message","role":"assistant","parts":[{"type":"text","text":"\(text)"}]}]}}
            """
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(json.utf8), response)
        }
        let value = try await AssistantAPI(http: http).transcript(token: "test", member: member, id: id)
        XCTAssertEqual(value.conversation?.messages.first?.parts.first?["text"]?.string?.count, text.count)
        do {
            _ = try await http.read("v1/example", token: "test", as: AssistantTranscriptEnvelope.self)
            XCTFail("Ordinary response limit was enlarged")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        do {
            _ = try await http.read(
                "v1/example", token: "test", responseLimit: 3_000_001, as: AssistantTranscriptEnvelope.self)
            XCTFail("Unbounded response limit accepted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .configuration) }
    }
}
