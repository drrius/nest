import Foundation
import XCTest

@testable import NestCore

final class CorrectionStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "correction-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let correction = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: nil)
        let command = SaveCorrection(operationId: UUID(), correction: correction)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueCorrection(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readCorrection(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishCorrection(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain correction")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueCorrection(.init(operationId: UUID(), correction: correction), lease: active)
            XCTFail("Replaced uncertain correction")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readCorrection(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readCorrection(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestCorrectionCancellation(lease: restored)
        let cancelledIntent = try await reopened.readCorrection(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = CorrectionReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, approvalId: nil, reversalEventId: UUID(), replacementEventId: nil,
            correction: correction)
        try await reopened.confirmCorrection(receipt, lease: restored)
        let confirmed = try await reopened.readCorrection(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.reversalEventId, receipt.reversalEventId)
        do {
            try await reopened.reconcileCorrection(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded correction with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishCorrection(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readCorrection(lease: restored)
        XCTAssertNil(cleared)
    }
}
