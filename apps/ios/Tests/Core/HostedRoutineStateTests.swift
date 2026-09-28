import Foundation
import XCTest

@testable import NestCore

final class HostedRoutineStateTests: XCTestCase {
    func testFictionalPauseResumeArchiveAndStaleRejection() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_ROUTINE_STATE"] == "1",
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
            operationId: UUID(), title: "Test Swift lifecycle " + UUID().uuidString,
            schedule: .oneOff(try CivilDate("2099-02-01")), assignment: .shared)
        let original = try await api.createRoutine(token: token, member: member, command: create)
        let pause = RoutineStateCommand(
            operationId: UUID(), routineId: original.routineId, expectedVersion: original.version, action: .pause)
        do {
            _ = try await api.setRoutineState(token: outsider, member: member, command: pause)
            XCTFail("Outsider changed chore state")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let paused = try await api.setRoutineState(token: token, member: member, command: pause)
        let replay = try await api.setRoutineState(token: token, member: member, command: pause)
        XCTAssertEqual(replay, paused)
        var list = try await api.routines(token: token, member: member)
        XCTAssertEqual(list.routines.first(where: { $0.id == original.routineId })?.state, .paused)
        let stale = RoutineStateCommand(
            operationId: UUID(), routineId: original.routineId, expectedVersion: original.version, action: .resume)
        do {
            _ = try await api.setRoutineState(token: token, member: member, command: stale)
            XCTFail("Stale version overwrote paused routine")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let resume = RoutineStateCommand(
            operationId: UUID(), routineId: original.routineId, expectedVersion: paused.version, action: .resume)
        let resumed = try await api.setRoutineState(token: token, member: member, command: resume)
        list = try await api.routines(token: token, member: member)
        XCTAssertEqual(list.routines.first(where: { $0.id == original.routineId })?.state, .active)
        let archive = RoutineStateCommand(
            operationId: UUID(), routineId: original.routineId, expectedVersion: resumed.version, action: .archive)
        let archived = try await api.setRoutineState(token: token, member: member, command: archive)
        let archiveReplay = try await api.setRoutineState(token: token, member: member, command: archive)
        XCTAssertEqual(archiveReplay, archived)
        list = try await api.routines(token: token, member: member)
        XCTAssertFalse(list.routines.contains(where: { $0.id == original.routineId }))
    }
}
