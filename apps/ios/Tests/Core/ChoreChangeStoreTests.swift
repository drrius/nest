import Foundation
import XCTest

@testable import NestCore

final class ChoreChangeStoreTests: XCTestCase {
    func testPendingChangesSurviveRestartAndStayAccountScoped() async throws {
        for reschedule in [false, true] { try await checkRecovery(reschedule: reschedule) }
    }

    private func checkRecovery(reschedule: Bool) async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "chore-change-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = ChoreChangeCommand(
            operationId: UUID(), occurrenceId: UUID(), expectedDueDate: try CivilDate("2026-09-28"),
            newDueDate: reschedule ? try CivilDate("2026-10-01") : nil)
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.enqueueChoreChange(command, title: "Tidy", lease: lease)
        do {
            try await store.finishChoreChange(operation: command.operationId, lease: lease)
            XCTFail("Uncertain request erased")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        let reopened = try ChoreOfflineStore(url: url)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let otherLease = try await reopened.activate(partner)
        let hidden = try await reopened.readChoreChange(lease: otherLease)
        XCTAssertNil(hidden)
        let current = try await reopened.activate(member)
        let pending = try await reopened.readChoreChange(lease: current)
        XCTAssertEqual(pending?.command, command)
        do {
            try await reopened.enqueueChoreChange(command, title: "Replacement", lease: current)
            XCTFail("Pending change replaced")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        if reschedule {
            let receipt = ChoreChangeReceipt(
                actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, occurrenceId: command.occurrenceId,
                previousDueDate: command.expectedDueDate, dueDate: command.newDueDate!,
                action: "reschedule", status: "open")
            try await reopened.acknowledgeChoreChange(receipt, lease: current)
            try await reopened.acknowledgeChoreChange(receipt, lease: current)
            do {
                try await reopened.conflictChoreChange(operation: command.operationId, lease: current)
                XCTFail("Confirmed result became conflicted")
            } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        } else {
            try await reopened.conflictChoreChange(operation: command.operationId, lease: current)
            let saved = try await reopened.readChoreChange(lease: current)
            XCTAssertTrue(saved?.conflicted == true)
        }
        try await reopened.finishChoreChange(operation: command.operationId, lease: current)
        let finished = try await reopened.readChoreChange(lease: current)
        XCTAssertNil(finished)
    }
}
