import Foundation
import XCTest

@testable import NestCore

final class HostedAssistantProviderTests: XCTestCase {
    func testFictionalLiveReadStreamPersistsAndCannotRegenerate() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_LIVE_AI"] == "1",
            env["NEST_TEST_ACTOR_ID"] == "791f7261-6c9d-4061-9c8a-57aa6e0b0200",
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional live-provider credentials and spend opt-in required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await ChoreAPI(http: http).verify(
            token: token, expectedActor: UUID(uuidString: env["NEST_TEST_ACTOR_ID"]!)!)
        guard member.displayName == "Test Alex",
            member.householdId == UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")
        else { throw NestAPIFailure.forbidden }
        let api = AssistantAPI(http: http)
        try await api.requireAvailable(token: token, member: member)
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0",
            text:
                "Use listChores to list my open household chores. This is a read-only QA check: do not change anything."
        )
        print("Fictional live AI fixture conversation:", command.conversationId.uuidString.lowercased())
        do {
            try await api.stream(command: command, token: outsider, household: member.householdId) { _ in
                XCTFail("Outsider received a private assistant frame")
            }
            XCTFail("Outsider started another household's assistant")
        } catch { XCTAssertTrue(error as? NestAPIFailure == .forbidden || error as? NestAPIFailure == .notMember) }
        let frames = HostedAssistantFrames()
        try await api.stream(command: command, token: token, household: member.householdId) {
            await frames.append($0)
        }
        let received = await frames.snapshot()
        XCTAssertEqual(received.last, .done)
        let errors = received.filter {
            if case .event(let item) = $0 { return item["type"]?.string == "error" }
            return false
        }
        XCTAssertTrue(errors.isEmpty, "A provider error is not a successful live integration")
        let turn = try await terminalTurn(api: api, token: token, member: member, command: command)
        XCTAssertEqual(turn.turn.state, .completed)
        try await verifyTranscript(api: api, token: token, member: member, command: command, turn: turn)
        do {
            try await api.stream(command: command, token: token, household: member.householdId) { _ in
                XCTFail("An existing turn regenerated an assistant frame")
            }
            XCTFail("An existing turn started another generation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let after = try await api.turn(token: token, member: member, command: command)
        XCTAssertEqual(after, turn)
        do {
            _ = try await api.transcript(token: outsider, member: member, id: command.conversationId)
            XCTFail("Outsider read the private saved assistant")
        } catch { XCTAssertTrue(error as? NestAPIFailure == .forbidden || error as? NestAPIFailure == .notMember) }
    }

    private func terminalTurn(
        api: AssistantAPI, token: String, member: VerifiedMember, command: StartAssistantTurn
    ) async throws -> AssistantTurnEnvelope {
        for _ in 0..<10 {
            let result = try await api.turn(token: token, member: member, command: command)
            if result.turn.state != .running { return result }
            try await Task.sleep(for: .milliseconds(300))
        }
        throw NestAPIFailure.unavailable
    }

    private func verifyTranscript(
        api: AssistantAPI, token: String, member: VerifiedMember, command: StartAssistantTurn,
        turn: AssistantTurnEnvelope
    ) async throws {
        let envelope = try await api.transcript(token: token, member: member, id: command.conversationId)
        let transcript = try XCTUnwrap(envelope.conversation)
        XCTAssertEqual(transcript.revision, turn.turn.finalRevision)
        XCTAssertEqual(transcript.messages.count, 2)
        let user = try XCTUnwrap(transcript.messages.first)
        XCTAssertEqual(user.role, .user)
        XCTAssertEqual(UUID(uuidString: user.id), command.operationId)
        let response = try XCTUnwrap(transcript.messages.last)
        XCTAssertEqual(response.role, .assistant)
        XCTAssertEqual(UUID(uuidString: response.id), turn.turn.assistantId)
        let tools = response.parts.filter { $0["type"]?.string?.hasPrefix("tool-") == true }
        XCTAssertFalse(tools.isEmpty, "A live read must use its authorized tool, not invent household facts")
        for part in tools {
            XCTAssertEqual(part["type"]?.string, "tool-listChores", "This fixture must only read chores")
            XCTAssertEqual(part["state"]?.string, "output-available")
            guard case .object(let output)? = part["output"] else { throw NestAPIFailure.contract }
            XCTAssertEqual(output["ok"], AssistantJSON.bool(true))
        }
        XCTAssertTrue(response.parts.contains { $0["type"]?.string == "text" && $0["text"]?.string?.isEmpty == false })
    }
}

private actor HostedAssistantFrames {
    private var frames: [AssistantStreamFrame] = []
    func append(_ frame: AssistantStreamFrame) { frames.append(frame) }
    func snapshot() -> [AssistantStreamFrame] { frames }
}
