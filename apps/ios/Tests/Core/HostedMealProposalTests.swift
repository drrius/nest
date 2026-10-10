import Foundation
import XCTest

@testable import NestCore

final class HostedMealProposalTests: XCTestCase {
    func testReservationReplayPrivateReadAndDiscardWithoutGeneration() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: url)!)
        let meals = MealAPI(http: http)
        let api = MealProposalAPI(http: http)
        let member = try await meals.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let start = try MealWeekStart("2035-06-04")
        let before = try await meals.week(token: token, member: member, start: start)
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: start,
            expectedWeekRevision: before.revision, familiarOnly: false)
        print("Hosted proposal: reserving fictional week")
        let reserved = try await api.reserve(token: token, member: member, command: command)
        print("Hosted proposal: reservation succeeded")
        do {
            let replay = try await api.reserve(token: token, member: member, command: command)
            XCTAssertEqual(reserved, replay)
            let opened = try await api.open(token: token, member: member, id: reserved.proposalId)
            XCTAssertEqual(opened.envelope.proposal.status, .generating)
            do {
                _ = try await api.open(token: outsider, member: member, id: reserved.proposalId)
                XCTFail("Outsider read private proposal")
            } catch {
                XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
            }
            let discard = try DiscardMealProposal(proposal: opened.envelope.proposal, operation: UUID())
            let receipt = try await api.discard(token: token, member: member, command: discard)
            let repeated = try await api.discard(token: token, member: member, command: discard)
            XCTAssertEqual(receipt, repeated)
            let ended = try await api.open(token: token, member: member, id: reserved.proposalId)
            XCTAssertEqual(ended.envelope.proposal.status, .discarded)
            let after = try await meals.week(token: token, member: member, start: start)
            XCTAssertEqual(before, after)
        } catch {
            let current = try await api.open(token: token, member: member, id: reserved.proposalId)
            if current.envelope.proposal.status != .discarded {
                _ = try await api.discard(
                    token: token, member: member,
                    command: DiscardMealProposal(proposal: current.envelope.proposal, operation: UUID()))
            }
            throw error
        }
    }
}
