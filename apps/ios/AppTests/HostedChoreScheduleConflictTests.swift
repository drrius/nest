import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedChoreScheduleConflictTests: XCTestCase {
    private let title = "Nest native schedule conflict 20261007"
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCreateOwnedRoutineOnce() async throws {
        let (api, member, token) = try await context("create", actor: alex)
        let list = try await api.routines(token: token, member: member)
        XCTAssertFalse(list.routines.contains { $0.definition.title == title })
        let command = try CreateRoutine(operationId: operation(), title: title, schedule: .daily, assignment: .shared)
        let receipt = try await api.createRoutine(token: token, member: member, command: command)
        let snapshot = try await api.snapshot(token: token, member: member)
        let chore = try owned(snapshot)
        try record(chore, routine: receipt.routineId, stage: "created")
    }

    func testPartnerReschedulesOwnedOccurrenceOnce() async throws {
        let (api, member, token) = try await context("reschedule", actor: sam)
        let snapshot = try await api.snapshot(token: token, member: member)
        let chore = try owned(snapshot)
        XCTAssertEqual(chore.id, try identifier("NEST_QA_OCCURRENCE"))
        XCTAssertEqual(chore.dueDate.value, try value("NEST_QA_ORIGINAL_DAY"))
        let moved = try CivilDate(value("NEST_QA_MOVED_DAY"))
        let command = ChoreChangeCommand(
            operationId: try operation(), occurrenceId: chore.id, expectedDueDate: chore.dueDate, newDueDate: moved)
        let receipt = try await api.changeOccurrence(token: token, member: member, command: command)
        XCTAssertEqual(receipt.status, "open")
        let refreshed = try owned(await api.snapshot(token: token, member: member))
        XCTAssertEqual(refreshed.id, chore.id)
        XCTAssertEqual(refreshed.dueDate, moved)
        try record(refreshed, routine: identifier("NEST_QA_ROUTINE"), stage: "rescheduled")
    }

    func testReadMovedOccurrenceWithoutCompleting() async throws {
        let (api, member, token) = try await context("read", actor: sam)
        let chore = try owned(await api.snapshot(token: token, member: member))
        XCTAssertEqual(chore.id, try identifier("NEST_QA_OCCURRENCE"))
        XCTAssertEqual(chore.dueDate.value, try value("NEST_QA_MOVED_DAY"))
        try record(chore, routine: identifier("NEST_QA_ROUTINE"), stage: "still-open")
    }

    func testArchiveOwnedRoutineOnce() async throws {
        let (api, member, token) = try await context("archive", actor: alex)
        let id = try identifier("NEST_QA_ROUTINE")
        let list = try await api.routines(token: token, member: member)
        let routine = try XCTUnwrap(list.routines.first { $0.id == id && $0.definition.title == title })
        let command = RoutineStateCommand(
            operationId: try operation(), routineId: id, expectedVersion: routine.version, action: .archive)
        let receipt = try await api.setRoutineState(token: token, member: member, command: command)
        XCTAssertEqual(receipt.action, "archive")
        let after = try await api.snapshot(token: token, member: member)
        XCTAssertFalse(after.chores.contains { $0.title == title })
    }

    private func context(_ action: String, actor: UUID) async throws -> (ChoreAPI, VerifiedMember, String) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SCHEDULE_CONFLICT"] == "20261007", env["NEST_QA_ACTION"] == action else {
            throw XCTSkip("Requires the exact prepared schedule-conflict fixture action")
        }
        #if targetEnvironment(simulator)
            let simulator = try value("SIMULATOR_UDID")
            guard
                simulator
                    == (actor == alex ? "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" : "CA0BCEDE-A297-493A-8921-9E31F8B65783")
            else {
                throw ScheduleConflictFixtureFailure.configuration
            }
        #else
            throw XCTSkip("Fictional schedule-conflict fixtures are forbidden on phones")
        #endif
        guard env["NEST_QA_POSITIVE_BUDGET"] == (action == "read" ? "0" : "1") else {
            throw ScheduleConflictFixtureFailure.configuration
        }
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ScheduleConflictFixtureFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("read.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: offline)
        let session = try await auth.session()
        guard session.userId == actor else { throw ScheduleConflictFixtureFailure.configuration }
        let api = ChoreAPI(http: try NestHTTP(baseURL: configuration.apiURL))
        let member = try await api.verify(token: session.accessToken, expectedActor: actor)
        guard member.householdId == household, member.displayName == (actor == alex ? "Test Alex" : "Test Sam") else {
            throw ScheduleConflictFixtureFailure.configuration
        }
        return (api, member, session.accessToken)
    }

    private func value(_ key: String) throws -> String {
        try XCTUnwrap(ProcessInfo.processInfo.environment[key])
    }

    private func identifier(_ key: String) throws -> UUID { try XCTUnwrap(UUID(uuidString: value(key))) }
    private func operation() throws -> UUID { try identifier("NEST_QA_OPERATION") }

    private func owned(_ snapshot: ChoreSnapshot) throws -> NestChore {
        let matches = snapshot.chores.filter { $0.title == title }
        XCTAssertEqual(matches.count, 1)
        let chore = try XCTUnwrap(matches.first)
        XCTAssertNil(chore.assigneeId)
        return chore
    }

    private func record(_ chore: NestChore, routine: UUID, stage: String) throws {
        let report = [
            "title": title, "routine": routine.uuidString.lowercased(), "occurrence": chore.id.uuidString.lowercased(),
            "due": chore.dueDate.value, "stage": stage,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned schedule conflict"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private enum ScheduleConflictFixtureFailure: Error { case configuration }
