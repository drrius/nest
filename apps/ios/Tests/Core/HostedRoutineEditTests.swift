import Foundation
import XCTest

@testable import NestCore

final class HostedRoutineEditTests: XCTestCase {
    func testFictionalEditReplayAndStaleRejection() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_ROUTINE_EDIT"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional lifecycle credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let api = ChoreAPI(http: try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!))
        let member = try await api.verify(token: token, expectedActor: actor)
        let roster = try await api.routineRoster(token: token, member: member)
        guard roster.members.count == 2, roster.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional household required")
        }
        let create = try CreateRoutine(
            operationId: UUID(), title: "Test Swift edit " + UUID().uuidString,
            schedule: .oneOff(try CivilDate("2099-02-01")), assignment: .shared)
        let original = try await api.createRoutine(token: token, member: member, command: create)
        let edit = EditRoutine(
            operationId: UUID(), routineId: original.routineId, expectedVersion: original.version,
            patch: RoutinePatch(title: nil, schedule: .oneOff(try CivilDate("2099-03-02")), assignment: nil))
        do {
            _ = try await api.editRoutine(token: outsider, member: member, command: edit)
            XCTFail("Outsider edited chore")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let edited = try await api.editRoutine(token: token, member: member, command: edit)
        let replay = try await api.editRoutine(token: token, member: member, command: edit)
        XCTAssertEqual(replay, edited)
        let list = try await api.routines(token: token, member: member)
        let current = try XCTUnwrap(list.routines.first { $0.id == original.routineId })
        XCTAssertEqual(current.definition.title, create.definition.title)
        XCTAssertEqual(current.definition.assignment, .shared)
        XCTAssertEqual(current.definition.schedule, .oneOff(try CivilDate("2099-03-02")))
        let stale = EditRoutine(
            operationId: UUID(), routineId: original.routineId, expectedVersion: original.version,
            patch: RoutinePatch(title: "Test stale edit", schedule: nil, assignment: nil))
        do {
            _ = try await api.editRoutine(token: token, member: member, command: stale)
            XCTFail("Stale edit overwrote current chore")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let altered = EditRoutine(
            operationId: edit.operationId, routineId: original.routineId, expectedVersion: original.version,
            patch: RoutinePatch(title: "Test changed request", schedule: nil, assignment: nil))
        do {
            _ = try await api.editRoutine(token: token, member: member, command: altered)
            XCTFail("Operation reused with altered patch")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
        _ = try await api.setRoutineState(
            token: token, member: member,
            command: RoutineStateCommand(
                operationId: UUID(), routineId: original.routineId, expectedVersion: edited.version, action: .archive))
    }
}
