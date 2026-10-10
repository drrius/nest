import Foundation
import XCTest

@testable import NestCore

final class MealProposalEditTests: XCTestCase {
    func testEditBindsExactChoiceOwnerAndLifecycle() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = MealProposalEditCommand(
            action: .choose, operationId: UUID(), proposalId: UUID(),
            expectedRevision: "2", entryId: UUID(), definitionId: UUID(), expectedLibraryRevision: "8")
        let receipt = MealProposalChangeReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, proposalId: command.proposalId, previousRevision: "2", revision: "3",
            entryId: command.entryId, action: .choose, definitionId: command.definitionId, expectedLibraryRevision: "8")
        func result(_ status: MealProposalEdit.Status, receipt: MealProposalChangeReceipt?) -> MealProposalEdit {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId, command: command,
                expiresAt: 1, status: status, failure: nil, receipt: receipt)
        }
        _ = try result(.applied, receipt: receipt).validated(member: member, expected: command)
        XCTAssertThrowsError(try result(.pending, receipt: receipt).validated(member: member, expected: command))
        XCTAssertThrowsError(try result(.failed, receipt: nil).validated(member: member, expected: command))
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try result(.applied, receipt: receipt).validated(member: partner, expected: command))
        let different = MealProposalEditCommand(
            action: .choose, operationId: command.operationId,
            proposalId: command.proposalId, expectedRevision: "2", entryId: command.entryId,
            definitionId: UUID(), expectedLibraryRevision: "8")
        XCTAssertThrowsError(try receipt.validated(member: member, command: different))
        let invalid = MealProposalEditCommand(
            action: .replace, operationId: UUID(), proposalId: UUID(),
            expectedRevision: "2", entryId: UUID(), definitionId: UUID(), expectedLibraryRevision: nil)
        XCTAssertThrowsError(try invalid.validated())
        let replace = MealProposalEditCommand(
            action: .replace, operationId: UUID(), proposalId: UUID(),
            expectedRevision: "2", entryId: UUID(), definitionId: nil, expectedLibraryRevision: nil)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(replace)) as? [String: Any])
        XCTAssertNil(wire["definitionId"])
        XCTAssertNil(wire["expectedLibraryRevision"])
        XCTAssertNil(wire["approve"])
    }
}
