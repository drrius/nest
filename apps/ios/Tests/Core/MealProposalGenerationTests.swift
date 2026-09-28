import Foundation
import XCTest

@testable import NestCore

final class MealProposalGenerationTests: XCTestCase {
    func testGenerationBindsRequestAndEnvelopeWithoutApproval() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let week = try MealWeekStart("2035-06-04")
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: week, expectedWeekRevision: "3", familiarOnly: true)
        let id = UUID()
        let receipt = MealProposalGenerationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, proposalId: id, revision: "1", weekStart: week, expectedWeekRevision: "3",
            familiarOnly: true)
        func result(revision: String = "3", familiar: Bool = true) -> MealProposalGenerationResult {
            let proposal = MealProposal(
                proposalId: id, revision: "1", weekRevision: revision, weekStart: week,
                familiarOnly: familiar, entries: nil, status: .generating, expiresAt: 2_100_000_000_000, failure: nil)
            return MealProposalGenerationResult(
                version: 1, receipt: receipt,
                envelope: .init(version: 1, actorId: member.userId, householdId: member.householdId, proposal: proposal)
            )
        }
        _ = try result().validated(member: member, command: command)
        _ = try result().validated(member: member, id: id)
        XCTAssertThrowsError(try result().validated(member: member, id: UUID()))
        XCTAssertThrowsError(try result(revision: "4").validated(member: member, command: command))
        XCTAssertThrowsError(try result(familiar: false).validated(member: member, command: command))
        let other = GenerateMealProposal(
            operationId: UUID(), weekStart: week, expectedWeekRevision: "3", familiarOnly: true)
        XCTAssertThrowsError(try result().validated(member: member, command: other))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["operationId", "weekStart", "expectedWeekRevision", "familiarOnly"])
    }
}
