import Foundation
import XCTest

@testable import NestCore

final class RoutineCancellationStoreTests: XCTestCase {
    func testCancellationIntentAndResultSurviveRestartAndCannotBeReversed() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-cancel-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRoutineCreation(command, lease: lease)
        try await store.requestRoutineCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRoutineCreation(lease: current)
        XCTAssertEqual(pending?.cancellationRequested, true)
        XCTAssertEqual(pending?.command, command)
        let result = RoutineCancellation(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.reconcileRoutineCancellation(result, lease: current)
        try await reopened.reconcileRoutineCancellation(result, lease: current)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z", action: "create")
        do {
            try await reopened.acknowledgeRoutineCreation(receipt, lease: current)
            XCTFail("Cancelled request became recorded")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let third = try ChoreOfflineStore(url: url)
        let finalLease = try await third.activate(member)
        let confirmed = try await third.readRoutineCreation(lease: finalLease)
        XCTAssertEqual(confirmed?.cancellation, result)
        try await third.finishRoutineCreation(operationId: command.operationId, lease: finalLease)
        let finished = try await third.readRoutineCreation(lease: finalLease)
        XCTAssertNil(finished)
    }
}
