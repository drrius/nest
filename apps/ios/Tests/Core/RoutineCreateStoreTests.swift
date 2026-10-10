import Foundation
import XCTest

@testable import NestCore

final class RoutineCreateStoreTests: XCTestCase {
    func testUncertainRequestSurvivesRestartAndRejectsCrossAccountAccess() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try CreateRoutine(
            operationId: UUID(), title: "Clean kitchen", schedule: .weekly(1), assignment: .shared)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRoutineCreation(command, lease: lease)
        do {
            try await store.finishRoutineCreation(operationId: command.operationId, lease: lease)
            XCTFail("Uncertain request discarded")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let partnerLease = try await reopened.activate(partner)
        let partnerSaved = try await reopened.readRoutineCreation(lease: partnerLease)
        XCTAssertNil(partnerSaved)
        do {
            _ = try await store.readRoutineCreation(lease: lease)
            XCTFail("Stale lease accessed saved command")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restoredLease = try await reopened.activate(member)
        let saved = try await reopened.readRoutineCreation(lease: restoredLease)
        XCTAssertEqual(saved?.command, command)
        XCTAssertNil(saved?.receipt)
        do {
            try await reopened.enqueueRoutineCreation(command, lease: restoredLease)
            XCTFail("Pending request replaced")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
    }

    func testOnlyMatchingStableReceiptAllowsCleanupAndSignOutRevokesAccess() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueRoutineCreation(command, lease: lease)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z", action: "create")
        let wrong = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: UUID(),
            routineId: UUID(), version: receipt.version, action: "create")
        do {
            try await store.acknowledgeRoutineCreation(wrong, lease: lease)
            XCTFail("Accepted unrelated receipt")
        } catch {}
        try await store.acknowledgeRoutineCreation(receipt, lease: lease)
        try await store.acknowledgeRoutineCreation(receipt, lease: lease)
        let changed = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: UUID(), version: receipt.version, action: "create")
        do {
            try await store.acknowledgeRoutineCreation(changed, lease: lease)
            XCTFail("Replaced confirmed routine identity")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let saved = try await store.readRoutineCreation(lease: lease)
        XCTAssertEqual(saved?.receipt, receipt)
        try await store.deactivate(lease)
        do {
            try await store.finishRoutineCreation(operationId: command.operationId, lease: lease)
            XCTFail("Signed-out cleanup allowed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let current = try await store.activate(member)
        try await store.finishRoutineCreation(operationId: command.operationId, lease: current)
        let finished = try await store.readRoutineCreation(lease: current)
        XCTAssertNil(finished)
    }
}
