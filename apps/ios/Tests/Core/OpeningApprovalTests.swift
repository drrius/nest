import Foundation
import XCTest

@testable import NestCore

final class OpeningApprovalTests: XCTestCase {
    func testOpeningApprovalPreservesExpectedReversalAndReplacementDuringRecovery() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "opening-approval-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let reversal = UUID()
        let replacement = UUID()
        let input = CorrectionInput(
            sourceEventId: UUID(), expectedReversalId: reversal,
            replacement: .opening(
                .init(
                    description: "Opening correction", amountCentimes: try Centimes("0"),
                    payerId: member.userId, date: try CivilDate("2026-09-28"), note: nil)))
        let decision = CorrectionDecision(operationId: UUID(), approvalId: UUID(), correction: input, approved: true)
        func result(_ reversed: UUID, _ replaced: UUID) -> CorrectionApprovalEnvelope {
            let receipt = CorrectionReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: decision.operationId, approvalId: decision.approvalId, reversalEventId: reversed,
                replacementEventId: replaced, correction: input)
            return .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: decision.approvalId, operationId: decision.operationId, correction: input,
                    status: .consumed, expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        let valid = result(reversal, replacement)
        _ = try valid.matching(decision, member: member, terminal: true)
        XCTAssertThrowsError(try result(UUID(), replacement).matching(decision, member: member, terminal: true))
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueCorrectionDecision(decision, lease: lease)
        try await store.reconcileCorrectionDecision(valid, lease: lease)
        do {
            try await store.reconcileCorrectionDecision(result(reversal, UUID()), lease: lease)
            XCTFail("Changed a confirmed replacement identity")
        } catch OfflineFailure.invalidOperation {}
        let saved = try await store.readCorrectionDecision(lease: lease)
        XCTAssertEqual(saved?.result?.approval.receipt?.replacementEventId, replacement)
        XCTAssertEqual(saved?.result?.approval.receipt?.reversalEventId, reversal)
    }
}
