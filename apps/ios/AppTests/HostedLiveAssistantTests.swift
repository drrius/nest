import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedLiveAssistantTests: XCTestCase {
    func testExistingFictionalMemberUsesLiveReadTool() async throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_LIVE_AI"] == "1",
            ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A"
        else { throw XCTSkip("Requires the owned fictional-member simulator and explicit live spend opt-in.") }
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.supabaseURL.host == "tkjixmujjoustdiedfmw.supabase.co" else {
            throw NestAPIFailure.forbidden
        }
        let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
        let session = try await NestAuth(configuration: configuration, offline: store).session()
        XCTAssertEqual(session.userId.uuidString.lowercased(), "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        guard session.userId.uuidString.lowercased() == "791f7261-6c9d-4061-9c8a-57aa6e0b0200" else {
            throw NestAPIFailure.forbidden
        }
        let http = try NestHTTP(baseURL: configuration.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: session.userId)
        let api = AssistantAPI(http: http)
        try await api.requireAvailable(token: session.accessToken, member: member)
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0",
            text: "Use listChores to list my open chores. Read only. Do not change anything.")
        try await api.stream(command: command, token: session.accessToken, household: member.householdId) { _ in }
        let turn = try await api.turn(token: session.accessToken, member: member, command: command)
        XCTAssertEqual(turn.turn.state, .completed)
        let history = try await api.transcript(token: session.accessToken, member: member, id: command.conversationId)
        let response = try XCTUnwrap(history.conversation?.messages.last)
        XCTAssertEqual(response.role, .assistant)
        XCTAssertTrue(response.parts.contains { $0["type"]?.string == "tool-listChores" })
        XCTAssertTrue(response.parts.contains { $0["type"]?.string == "text" && $0["text"]?.string?.isEmpty == false })
    }
}
