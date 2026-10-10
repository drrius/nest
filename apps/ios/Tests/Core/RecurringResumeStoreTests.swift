import Foundation
import XCTest

@testable import NestCore

final class RecurringResumeStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "change-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let change = RecurringResumeInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: "paused",
            action: "resume", resumeFrom: try CivilDate("2026-09-28"), firstDueOn: try CivilDate("2026-09-28"))
        let configuration = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil,
            note: nil, startDate: try CivilDate("2026-09-01"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let command = SaveRecurringResume(operationId: UUID(), change: change)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurringResume(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readRecurringResume(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishRecurringResume(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain change")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueRecurringResume(.init(operationId: UUID(), change: change), lease: active)
            XCTFail("Replaced uncertain change")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readRecurringResume(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readRecurringResume(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestRecurringResumeCancellation(lease: restored)
        let cancelledIntent = try await reopened.readRecurringResume(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = RecurringResumeReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, approvalId: nil, revision: UUID(), status: .active, change: change,
            configuration: configuration, coveredThrough: nil)
        try await reopened.confirmRecurringResume(receipt, lease: restored)
        let confirmed = try await reopened.readRecurringResume(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.revision, receipt.revision)
        do {
            try await reopened.reconcileRecurringResume(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded change with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishRecurringResume(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readRecurringResume(lease: restored)
        XCTAssertNil(cleared)
    }
}
