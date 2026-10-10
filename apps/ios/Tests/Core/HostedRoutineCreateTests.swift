import Foundation
import XCTest

@testable import NestCore

final class HostedRoutineCreateTests: XCTestCase {
    func testFictionalRoutineCreationReplayAndOutsiderDenial() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_ROUTINE_CREATE"] == "1",
            let operation = env["NEST_TEST_ROUTINE_OPERATION"].flatMap(UUID.init(uuidString:)),
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional write credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let api = ChoreAPI(http: http)
        let member = try await api.verify(token: token, expectedActor: actor)
        let roster = try await api.routineRoster(token: token, member: member)
        guard member.displayName.hasPrefix("Test "), roster.members.count == 2,
            roster.members.allSatisfy({ $0.displayName.hasPrefix("Test ") })
        else { throw XCTSkip("Two fictional household members required") }
        let command = try CreateRoutine(
            operationId: operation, title: "Test hosted Swift chore " + operation.uuidString.lowercased(),
            schedule: .oneOff(try CivilDate("2099-01-01")), assignment: .shared)
        do {
            _ = try await api.createRoutine(token: outsider, member: member, command: command)
            XCTFail("Outsider created household chore")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.createRoutine(token: token, member: member, command: command)
        let replay = try await api.createRoutine(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let changed = try CreateRoutine(
            operationId: operation, title: command.definition.title + " changed",
            schedule: command.definition.schedule, assignment: .shared)
        do {
            _ = try await api.createRoutine(token: token, member: member, command: changed)
            XCTFail("Operation identity accepted changed content")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
        let page = try await http.read(
            "v1/routines", token: token, household: member.householdId, as: RoutineVerificationPage.self)
        XCTAssertEqual(page.version, 1)
        XCTAssertEqual(page.householdId, member.householdId)
        let matches = page.routines.filter { $0.definition.title == command.definition.title }
        XCTAssertEqual(matches.count, 1)
        XCTAssertEqual(matches.first?.routineId, receipt.routineId)
    }
}

private struct RoutineVerificationPage: Decodable {
    struct Row: Decodable {
        struct Definition: Decodable { let title: String }
        let routineId: UUID
        let definition: Definition
    }
    let version: Int
    let householdId: UUID
    let routines: [Row]
}
