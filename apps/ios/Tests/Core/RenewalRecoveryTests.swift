import XCTest

@testable import NestCore

final class RenewalRecoveryTests: XCTestCase {
    func testRestartCancellationIntentAndTerminalReceiptAreImmutable() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "renewal-recovery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let fields = CalendarRenewal.Fields(
            title: "Fixture", renewalOn: try CivilDate("2028-03-01"),
            noticeDays: 1, responsibleId: nil, recurringRuleId: nil)
        let command = RenewalCommand(operationId: UUID(), renewalId: UUID(), expectedRevision: nil, fields: fields)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.stageRenewalRequest(.init(baseline: nil, command: command, result: nil), lease: lease)
        try await first.requestRenewalCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readRenewalRequest(lease: current)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.cancellationRequested, true)
        do {
            try await reopened.finishRenewalRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain operation")
        } catch {}
        let cancelled = RenewalRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        try await reopened.recordRenewalRecovery(cancelled, lease: current)
        let unresolved = RenewalRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        do {
            try await reopened.recordRenewalRecovery(unresolved, lease: current)
            XCTFail("Regressed confirmed cancellation")
        } catch {}
        try await reopened.finishRenewalRequest(operation: command.operationId, lease: current)
        let cleared = try await reopened.readRenewalRequest(lease: current)
        XCTAssertNil(cleared)
    }

    func testOwnerIsolationAndRemovalCannotChangeRetainedFields() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "renewal-scope-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let fields = CalendarRenewal.Fields(
            title: "Original", renewalOn: try CivilDate("2026-12-01"),
            noticeDays: 30, responsibleId: nil, recurringRuleId: nil)
        let baseline = CalendarRenewal(
            renewalId: UUID(), revision: UUID(), fields: fields,
            cancellationOn: fields.cancellationDeadline!, removed: false)
        let command = RenewalCommand(
            operationId: UUID(), renewalId: baseline.id,
            expectedRevision: baseline.revision, fields: nil)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.stageRenewalRequest(.init(baseline: baseline, command: command, result: nil), lease: lease)
        let other = try await store.activate(partner)
        let foreign = try await store.readRenewalRequest(lease: other)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readRenewalRequest(lease: lease)
            XCTFail("Invalidated lease remained readable")
        } catch {}
        let current = try await store.activate(member)
        let altered = CalendarRenewal.Fields(
            title: "Changed", renewalOn: fields.renewalOn, noticeDays: 30,
            responsibleId: nil, recurringRuleId: nil)
        let record = CalendarRenewal(
            renewalId: baseline.id, revision: UUID(), fields: altered,
            cancellationOn: altered.cancellationDeadline!, removed: true)
        let receipt = RenewalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, action: .removed, renewal: record)
        let result = RenewalRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        do {
            try await store.recordRenewalRecovery(result, lease: current)
            XCTFail("Removal altered retained fields")
        } catch {}
        let retained = try await store.readRenewalRequest(lease: current)
        XCTAssertNil(retained?.result)
    }
}
