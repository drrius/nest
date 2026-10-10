import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedLiveAssistantTests: XCTestCase {
    func testLiveMealProposalDoesNotSaveTheWeekWithoutApproval() async throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_LIVE_AI"] == "1",
            ProcessInfo.processInfo.environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A"
        else { throw XCTSkip("Requires the fictional-member simulator and explicit live spend opt-in.") }
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.supabaseURL.host == "tkjixmujjoustdiedfmw.supabase.co" else {
            throw NestAPIFailure.forbidden
        }
        let store = try ChoreOfflineStore.application(environment: configuration.supabaseURL)
        let session = try await NestAuth(configuration: configuration, offline: store).session()
        guard session.userId.uuidString.lowercased() == "791f7261-6c9d-4061-9c8a-57aa6e0b0200" else {
            throw NestAPIFailure.forbidden
        }
        let http = try NestHTTP(baseURL: configuration.apiURL)
        let meals = MealAPI(http: http)
        let member = try await meals.verify(token: session.accessToken, expectedActor: session.userId)
        let start = try MealWeekStart("2035-06-04")
        let before = try await meals.week(token: session.accessToken, member: member, start: start)
        let api = MealProposalAPI(http: http)
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: start, expectedWeekRevision: before.revision, familiarOnly: false)
        let generated = try await api.generate(token: session.accessToken, member: member, command: command)
        var proposal = generated.envelope.proposal
        for _ in 0..<30 where proposal.status == .generating {
            try await Task.sleep(for: .seconds(2))
            proposal = try await api.open(token: session.accessToken, member: member, id: proposal.id).envelope.proposal
        }
        XCTAssertEqual(proposal.status, .ready)
        XCTAssertFalse(proposal.entries?.isEmpty ?? true)
        let after = try await meals.week(token: session.accessToken, member: member, start: start)
        XCTAssertEqual(after, before)
        _ = try await api.discard(
            token: session.accessToken, member: member,
            command: DiscardMealProposal(proposal: proposal, operation: UUID()))
    }

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
