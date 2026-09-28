import Foundation
import XCTest

@testable import NestCore

final class HostedRoutineCancellationTests: XCTestCase {
    func testCancelledAndRecordedOutcomes() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_ROUTINE_CANCEL"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated cancellation credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let api = ChoreAPI(http: try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!))
        let member = try await api.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw XCTSkip("Fictional member required") }
        let command = try CreateRoutine(
            operationId: UUID(uuidString: "9792066b-e02c-4f60-ac51-c930b24c97c1")!,
            title: "Test cancelled Swift chore", schedule: .oneOff(try CivilDate("2099-01-01")), assignment: .shared)
        do {
            _ = try await api.cancelRoutineCreation(token: outsider, member: member, command: command)
            XCTFail("Outsider cancelled a household request")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let cancelled = try await api.cancelRoutineCreation(token: token, member: member, command: command)
        XCTAssertEqual(cancelled.status, .cancelled)
        let replay = try await api.cancelRoutineCreation(token: token, member: member, command: command)
        XCTAssertEqual(replay, cancelled)
        do {
            _ = try await api.createRoutine(token: token, member: member, command: command)
            XCTFail("Cancelled request created a chore")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
        let prior = UUID(uuidString: "da611b3b-2b21-4b3b-8d4d-588f88395278")!
        let recordedCommand = try CreateRoutine(
            operationId: prior, title: "Test hosted Swift chore " + prior.uuidString.lowercased(),
            schedule: .oneOff(try CivilDate("2099-01-01")), assignment: .shared)
        let recorded = try await api.cancelRoutineCreation(token: token, member: member, command: recordedCommand)
        XCTAssertEqual(recorded.status, .recorded)
        XCTAssertNotNil(recorded.receipt)
        let existing = try await api.createRoutine(token: token, member: member, command: recordedCommand)
        XCTAssertEqual(existing, recorded.receipt)
    }
}
