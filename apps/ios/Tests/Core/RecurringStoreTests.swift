import Foundation
import XCTest

@testable import NestCore

final class RecurringStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "change-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let configuration = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil,
            note: nil, startDate: try CivilDate("2026-09-01"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let rule = RecurringInput(
            ruleId: UUID(), expectedRevision: nil, configuration: configuration,
            firstDueOn: try CivilDate("2026-09-28"))
        let command = SaveRecurring(operationId: UUID(), rule: rule)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurring(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readRecurring(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishRecurring(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain change")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueRecurring(.init(operationId: UUID(), rule: rule), lease: active)
            XCTFail("Replaced uncertain change")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readRecurring(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readRecurring(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestRecurringCancellation(lease: restored)
        let cancelledIntent = try await reopened.readRecurring(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = RecurringReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, approvalId: nil, revision: UUID(), status: .active, rule: rule)
        try await reopened.confirmRecurring(receipt, lease: restored)
        let confirmed = try await reopened.readRecurring(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.revision, receipt.revision)
        do {
            try await reopened.reconcileRecurring(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded change with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishRecurring(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readRecurring(lease: restored)
        XCTAssertNil(cleared)
    }
}
