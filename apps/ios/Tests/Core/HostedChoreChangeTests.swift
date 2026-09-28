import Foundation
import XCTest

@testable import NestCore

final class HostedChoreChangeTests: XCTestCase {
    func testFictionalRescheduleAndSkipReplay() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_CHORE_CHANGE"] == "1",
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
            operationId: UUID(), title: "Test Swift occurrence " + UUID().uuidString,
            schedule: .oneOff(try CivilDate("2099-02-01")), assignment: .shared)
        let original = try await api.createRoutine(token: token, member: member, command: create)
        let snapshot = try await api.snapshot(token: token, member: member)
        let occurrence = try XCTUnwrap(snapshot.chores.first { $0.title == create.definition.title })
        let change = ChoreChangeCommand(
            operationId: UUID(), occurrenceId: occurrence.id, expectedDueDate: occurrence.dueDate,
            newDueDate: try CivilDate("2099-03-03"))
        do {
            _ = try await api.changeOccurrence(token: outsider, member: member, command: change)
            XCTFail("Outsider rescheduled chore")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let changed = try await api.changeOccurrence(token: token, member: member, command: change)
        let replay = try await api.changeOccurrence(token: token, member: member, command: change)
        XCTAssertEqual(changed, replay)
        let refreshed = try await api.snapshot(token: token, member: member)
        XCTAssertEqual(refreshed.chores.first { $0.id == occurrence.id }?.dueDate, change.newDueDate)
        let stale = ChoreChangeCommand(
            operationId: UUID(), occurrenceId: occurrence.id, expectedDueDate: occurrence.dueDate, newDueDate: nil)
        do {
            _ = try await api.changeOccurrence(token: token, member: member, command: stale)
            XCTFail("Stale skip accepted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let skip = ChoreChangeCommand(
            operationId: UUID(), occurrenceId: occurrence.id, expectedDueDate: changed.dueDate, newDueDate: nil)
        let skipped = try await api.changeOccurrence(token: token, member: member, command: skip)
        let skipReplay = try await api.changeOccurrence(token: token, member: member, command: skip)
        XCTAssertEqual(skipReplay, skipped)
        XCTAssertEqual(skipped.status, "skipped")
        let final = try await api.snapshot(token: token, member: member)
        XCTAssertFalse(final.chores.contains { $0.id == occurrence.id })
        let routines = try await api.routines(token: token, member: member)
        let current = try XCTUnwrap(routines.routines.first { $0.id == original.routineId })
        _ = try await api.setRoutineState(
            token: token, member: member,
            command: RoutineStateCommand(
                operationId: UUID(), routineId: original.routineId, expectedVersion: current.version, action: .archive))
    }
}
