import Foundation
import XCTest

@testable import NestCore

final class RecurringStateStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "change-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let change = RecurringStateInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: .active, action: .pause)
        let command = SaveRecurringState(operationId: UUID(), change: change)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurringState(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readRecurringState(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishRecurringState(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain change")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueRecurringState(.init(operationId: UUID(), change: change), lease: active)
            XCTFail("Replaced uncertain change")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readRecurringState(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readRecurringState(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestRecurringStateCancellation(lease: restored)
        let cancelledIntent = try await reopened.readRecurringState(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = RecurringStateReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, approvalId: nil, revision: UUID(), status: .paused, change: change)
        try await reopened.confirmRecurringState(receipt, lease: restored)
        let confirmed = try await reopened.readRecurringState(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.revision, receipt.revision)
        do {
            try await reopened.reconcileRecurringState(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded change with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishRecurringState(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readRecurringState(lease: restored)
        XCTAssertNil(cleared)
    }
}
