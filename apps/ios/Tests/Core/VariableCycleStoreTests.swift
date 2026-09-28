import Foundation
import XCTest

@testable import NestCore

final class VariableCycleStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "input-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let allocations = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let input = VariableCycleInput(
            ruleId: UUID(), expectedRevision: UUID(),
            dueOn: try CivilDate("2026-09-28"), amountCentimes: try Centimes("101"), allocations: allocations)
        let command = SaveVariableCycle(operationId: UUID(), input: input)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueVariableCycle(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readVariableCycle(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishVariableCycle(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain input")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueVariableCycle(.init(operationId: UUID(), input: input), lease: active)
            XCTFail("Replaced uncertain input")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readVariableCycle(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readVariableCycle(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestVariableCycleCancellation(lease: restored)
        let cancelledIntent = try await reopened.readVariableCycle(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let cancelled = VariableCycleRecovery(
            version: 1, actorId: member.userId,
            householdId: member.householdId, operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.reconcileVariableCycle(cancelled, lease: restored)
        do {
            try await reopened.reconcileVariableCycle(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .unresolved, receipt: nil), lease: restored)
            XCTFail("Reopened a terminal cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishVariableCycle(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readVariableCycle(lease: restored)
        XCTAssertNil(cleared)
    }
}
