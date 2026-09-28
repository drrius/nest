import Foundation
import XCTest

@testable import NestCore

final class SettlementStoreTests: XCTestCase {
    func testRestartRetainsUncertainCommandAndOnlyExactTerminalOutcomeReleasesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "settlement-store-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let settlement = SettlementInput(
            description: "Settlement", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId, recipientId: UUID(),
            mode: .full, date: try CivilDate("2026-09-28"), note: nil)
        let command = SaveSettlement(operationId: UUID(), settlement: settlement)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueSettlement(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readSettlement(lease: active)
        XCTAssertEqual(saved?.command, command)
        do {
            try await reopened.finishSettlement(operation: command.operationId, lease: active)
            XCTFail("Discarded uncertain settlement")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await reopened.enqueueSettlement(.init(operationId: UUID(), settlement: settlement), lease: active)
            XCTFail("Replaced uncertain settlement")
        } catch OfflineFailure.invalidOperation {}
        let outsider = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(outsider)
        let otherSaved = try await reopened.readSettlement(lease: otherLease)
        XCTAssertNil(otherSaved)
        do {
            _ = try await reopened.readSettlement(lease: active)
            XCTFail("Used old account lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestSettlementCancellation(lease: restored)
        let cancelledIntent = try await reopened.readSettlement(lease: restored)
        XCTAssertEqual(cancelledIntent?.cancellationRequested, true)
        let receipt = SettlementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, eventId: UUID(), approvalId: nil, settlement: settlement)
        try await reopened.confirmSettlement(receipt, lease: restored)
        let confirmed = try await reopened.readSettlement(lease: restored)
        XCTAssertEqual(confirmed?.result?.receipt?.eventId, receipt.eventId)
        do {
            try await reopened.reconcileSettlement(
                .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    operationId: command.operationId, status: .cancelled, receipt: nil), lease: restored)
            XCTFail("Overwrote a recorded settlement with cancellation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishSettlement(operation: command.operationId, lease: restored)
        let cleared = try await reopened.readSettlement(lease: restored)
        XCTAssertNil(cleared)
    }
}
