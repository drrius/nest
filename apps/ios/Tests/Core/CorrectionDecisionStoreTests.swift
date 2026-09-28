import Foundation
import XCTest

@testable import NestCore

final class CorrectionDecisionStoreTests: XCTestCase {
    func testRestartPreservesDecisionAndRejectsReplacementOrPrematureDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let correction = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: nil)
        let decision = CorrectionDecision(
            operationId: UUID(), approvalId: UUID(), correction: correction, approved: false)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueCorrectionDecision(decision, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readCorrectionDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        do {
            try await store.enqueueCorrectionDecision(decision, lease: active)
            XCTFail("Replaced uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishCorrectionDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded uncertain decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readCorrectionDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readCorrectionDecision(lease: active)
            XCTFail("Old account lease accepted")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let result = CorrectionApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, correction: correction,
                status: .denied, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: nil))
        try await store.reconcileCorrectionDecision(result, lease: restored)
        try await store.finishCorrectionDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readCorrectionDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
