import Foundation
import XCTest

@testable import NestCore

final class RecurringStateTests: XCTestCase {
    func testStateChangesBindRevisionActionAndAccount() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let change = RecurringStateInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: .active, action: .pause)
        let command = SaveRecurringState(operationId: UUID(), change: change)
        func receipt(revision: UUID, status: RecurringRule.Status) -> RecurringStateReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, revision: revision, status: status, change: change)
        }
        let confirmed = receipt(revision: UUID(), status: .paused)
        _ = try confirmed.validated(member: member, command: command)
        XCTAssertThrowsError(
            try receipt(revision: change.expectedRevision, status: .paused).validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt(revision: UUID(), status: .cancelled).validated(member: member, command: command))
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try confirmed.validated(member: outsider, command: command))
        XCTAssertThrowsError(
            try RecurringStateInput(
                ruleId: change.ruleId, expectedRevision: UUID(), expectedStatus: .paused, action: .pause
            ).validated())
        XCTAssertThrowsError(
            try RecurringStateInput(
                ruleId: change.ruleId, expectedRevision: UUID(), expectedStatus: .cancelled, action: .cancel
            ).validated())
        try RecurringStateInput(
            ruleId: change.ruleId, expectedRevision: UUID(), expectedStatus: .paused, action: .cancel
        ).validated()
        let unresolved = RecurringStateRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .unresolved, receipt: nil)
        XCTAssertThrowsError(try unresolved.validated(member: member, command: command, cancellation: true))
    }
}
