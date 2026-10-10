import Foundation
import XCTest

@testable import NestCore

final class HostedChoreReminderTests: XCTestCase {
    func testFictionalReminderIsolationReplayAndCancellation() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_CHORE_REMINDER"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional reminder credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let chores = ChoreAPI(http: http)
        let api = NotificationAPI(http: http)
        let member = try await chores.verify(token: token, expectedActor: actor)
        let roster = try await chores.routineRoster(token: token, member: member)
        guard roster.members.count == 2, roster.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional household required")
        }
        let create = try CreateRoutine(
            operationId: UUID(), title: "Test Swift reminder " + UUID().uuidString,
            schedule: .oneOff(try CivilDate("2099-02-01")), assignment: .shared)
        let original = try await chores.createRoutine(token: token, member: member, command: create)
        let archive = RoutineStateCommand(
            operationId: UUID(), routineId: original.routineId,
            expectedVersion: original.version, action: .archive)
        do {
            let snapshot = try await chores.snapshot(token: token, member: member)
            let occurrence = try XCTUnwrap(snapshot.chores.first { $0.title == create.definition.title })
            try await verify(api: api, token: token, outsider: outsider, member: member, id: occurrence.id)
        } catch {
            _ = try await chores.setRoutineState(token: token, member: member, command: archive)
            throw error
        }
        _ = try await chores.setRoutineState(token: token, member: member, command: archive)
    }

    private func verify(api: NotificationAPI, token: String, outsider: String, member: VerifiedMember, id: UUID)
        async throws
    {
        let baseline = try await api.choreReminder(token: token, member: member, id: id)
        XCTAssertNil(baseline.reminder)
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let command = SaveChoreReminder(
            operationId: UUID(), occurrenceId: id,
            expectedItemRevision: baseline.itemRevision, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.choreReminder(token: outsider, member: member, id: id)
            XCTFail("Outsider read household reminder")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.saveChoreReminder(token: outsider, member: member, command: command)
            XCTFail("Outsider changed recipient consent")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.saveChoreReminder(token: token, member: member, command: command)
        let replay = try await api.saveChoreReminder(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let recovered = try await api.recoverChoreReminder(
            token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.receipt, receipt)
        let changed = SaveChoreReminder(
            operationId: UUID(), occurrenceId: id,
            expectedItemRevision: baseline.itemRevision, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.saveChoreReminder(token: token, member: member, command: changed)
            XCTFail("Stale reminder revision overwrote choices")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancelled = try await api.recoverChoreReminder(token: token, member: member, command: changed, cancel: true)
        XCTAssertEqual(cancelled.status, .cancelled)
        do {
            _ = try await api.saveChoreReminder(token: token, member: member, command: changed)
            XCTFail("Cancelled reminder request was recorded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        var disabled = settings
        disabled.enabled = false
        let off = SaveChoreReminder(
            operationId: UUID(), occurrenceId: id,
            expectedItemRevision: baseline.itemRevision,
            expectedRevision: receipt.reminder.revision, settings: disabled)
        let offReceipt = try await api.saveChoreReminder(token: token, member: member, command: off)
        let current = try await api.choreReminder(token: token, member: member, id: id)
        XCTAssertEqual(current.reminder, offReceipt.reminder)
        XCTAssertFalse(try XCTUnwrap(current.reminder).settings.enabled)
    }
}
