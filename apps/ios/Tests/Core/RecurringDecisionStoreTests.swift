import Foundation
import XCTest

@testable import NestCore

final class RecurringDecisionStoreTests: XCTestCase {
    func testRestartPreservesDecisionAndRejectsReplacementOrPrematureDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let rule = RecurringInput(
            ruleId: UUID(), expectedRevision: nil,
            configuration: .init(
                description: "Bill", payerId: member.userId, categoryId: nil,
                note: nil, startDate: try CivilDate("2026-09-01"),
                schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
                mode: .variable, amountCentimes: nil, allocations: nil), firstDueOn: try CivilDate("2026-09-28"))
        let decision = RecurringDecision(operationId: UUID(), approvalId: UUID(), rule: rule, approved: false)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurringDecision(decision, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readRecurringDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        do {
            try await store.enqueueRecurringDecision(decision, lease: active)
            XCTFail("Replaced uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishRecurringDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readRecurringDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readRecurringDecision(lease: active)
            XCTFail("Old account lease accepted")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let result = RecurringApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, rule: rule,
                status: .denied, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: nil))
        try await store.reconcileRecurringDecision(result, lease: restored)
        try await store.finishRecurringDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readRecurringDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
