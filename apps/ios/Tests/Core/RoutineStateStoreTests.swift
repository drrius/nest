import Foundation
import XCTest

@testable import NestCore

final class RoutineStateStoreTests: XCTestCase {
    func testPendingStateKeepsRevisionAcrossRestartAndCannotCrossAccounts() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-state-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = RoutineStateCommand(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z", action: .archive)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRoutineState(command, title: "Tidy", lease: lease)
        do {
            try await store.finishRoutineState(operation: command.operationId, lease: lease)
            XCTFail("Uncertain request erased")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let otherLease = try await reopened.activate(partner)
        let hidden = try await reopened.readRoutineState(lease: otherLease)
        XCTAssertNil(hidden)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRoutineState(lease: current)
        XCTAssertEqual(pending?.command, command)
        try await reopened.conflictRoutineState(operation: command.operationId, lease: current)
        let conflicted = try await reopened.readRoutineState(lease: current)
        XCTAssertTrue(conflicted?.conflicted == true)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, routineId: command.routineId, version: command.expectedVersion,
            action: "archive")
        do {
            try await reopened.acknowledgeRoutineState(receipt, lease: current)
            XCTFail("Conflict became confirmed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        try await reopened.finishRoutineState(operation: command.operationId, lease: current)
        let finished = try await reopened.readRoutineState(lease: current)
        XCTAssertNil(finished)
    }
}
