import Foundation
import XCTest

@testable import NestCore

final class RoutineEditStoreTests: XCTestCase {
    func testPendingStateKeepsRevisionAcrossRestartAndCannotCrossAccounts() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = EditRoutine(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z",
            patch: RoutinePatch(title: "Changed", schedule: nil, assignment: nil))
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRoutineEdit(command, title: "Tidy", lease: lease)
        do {
            try await store.finishRoutineEdit(operation: command.operationId, lease: lease)
            XCTFail("Uncertain request erased")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let otherLease = try await reopened.activate(partner)
        let hidden = try await reopened.readRoutineEdit(lease: otherLease)
        XCTAssertNil(hidden)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRoutineEdit(lease: current)
        XCTAssertEqual(pending?.command, command)
        try await reopened.conflictRoutineEdit(operation: command.operationId, lease: current)
        let conflicted = try await reopened.readRoutineEdit(lease: current)
        XCTAssertTrue(conflicted?.conflicted == true)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, routineId: command.routineId, version: command.expectedVersion,
            action: "edit")
        do {
            try await reopened.acknowledgeRoutineEdit(receipt, lease: current)
            XCTFail("Conflict became confirmed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        try await reopened.finishRoutineEdit(operation: command.operationId, lease: current)
        let finished = try await reopened.readRoutineEdit(lease: current)
        XCTAssertNil(finished)
    }
    func testConfirmedEditRejectsReplacementAndContradiction() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = EditRoutine(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z",
            patch: RoutinePatch(title: nil, schedule: .daily, assignment: nil))
        try await store.enqueueRoutineEdit(command, title: "Original", lease: lease)
        do {
            try await store.enqueueRoutineEdit(command, title: "Replacement", lease: lease)
            XCTFail("Pending request replaced")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: command.routineId, version: "2026-09-28T09:00:01.123457Z", action: "edit")
        try await store.acknowledgeRoutineEdit(receipt, lease: lease)
        try await store.acknowledgeRoutineEdit(receipt, lease: lease)
        do {
            try await store.conflictRoutineEdit(operation: command.operationId, lease: lease)
            XCTFail("Confirmed receipt became conflicted")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let saved = try await reopened.readRoutineEdit(lease: current)
        XCTAssertEqual(saved?.receipt, receipt)
        XCTAssertEqual(saved?.command, command)
        try await reopened.finishRoutineEdit(operation: command.operationId, lease: current)
        let finished = try await reopened.readRoutineEdit(lease: current)
        XCTAssertNil(finished)
    }

}
