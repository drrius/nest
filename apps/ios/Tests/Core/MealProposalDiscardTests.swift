import Foundation
import XCTest

@testable import NestCore

final class MealProposalDiscardTests: XCTestCase {
    func testDiscardAllowsExpiredUnfinishedProposalButRejectsTerminalState() throws {
        for status in [MealProposal.Status.generating, .failed, .discarded] {
            let proposal = MealProposal(
                proposalId: UUID(), revision: "1", weekRevision: "0", weekStart: try MealWeekStart("2035-06-04"),
                familiarOnly: false, entries: nil, status: status, expiresAt: 1,
                failure: status == .failed ? .unavailable : nil)
            if status == .discarded {
                XCTAssertThrowsError(try DiscardMealProposal(proposal: proposal, operation: UUID()))
            } else {
                let command = try DiscardMealProposal(proposal: proposal, operation: UUID())
                XCTAssertEqual(
                    try JSONDecoder().decode(DiscardMealProposal.self, from: JSONEncoder().encode(command)), command)
            }
        }
    }

    func testReceiptBindsOwnerOperationAndExactRevision() throws {
        let proposal = MealProposal(
            proposalId: UUID(), revision: "1", weekRevision: "0", weekStart: try MealWeekStart("2035-06-04"),
            familiarOnly: false, entries: nil, status: .generating, expiresAt: 1, failure: nil)
        let command = try DiscardMealProposal(proposal: proposal, operation: UUID())
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        func receipt(revision: String = "2", operation: UUID? = nil) -> MealProposalDiscardReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: operation ?? command.operationId, proposalId: proposal.id,
                previousRevision: "1", revision: revision)
        }
        _ = try receipt().validated(member: member, command: command)
        XCTAssertThrowsError(try receipt(revision: "3").validated(member: member, command: command))
        XCTAssertThrowsError(try receipt(operation: UUID()).validated(member: member, command: command))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt().validated(member: partner, command: command))
    }
}
