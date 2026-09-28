import Foundation
import XCTest

@testable import NestCore

final class MealProposalApprovalTests: XCTestCase {
    func testApprovalRequiresReadyUnexpiredExactPreview() throws {
        let value = try proposal()
        let command = try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 1))
        _ = try command.validated(against: value)
        XCTAssertThrowsError(
            try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 3_000_000_000))
        )
        XCTAssertThrowsError(try command.validated(against: proposal()))
        // Stored exact retries remain valid even after expiry; the server resolves their operation identity.
        XCTAssertEqual(try JSONDecoder().decode(ApproveMealProposal.self, from: JSONEncoder().encode(command)), command)
    }

    func testReceiptRejectsChangedPostedMealAndRevision() throws {
        let value = try proposal()
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try ApproveMealProposal(proposal: value, operation: UUID(), now: Date(timeIntervalSince1970: 1))
        let expected = try XCTUnwrap(value.entries?.first)
        let posted = PostedProposalMeal(
            proposalEntryId: expected.id, entryId: UUID(), date: expected.date, slot: expected.slot)
        func receipt(_ rows: [PostedProposalMeal], weekRevision: String = "4") -> MealProposalApprovalReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
                proposalId: value.id, approvedRevision: "1", revision: "2", weekStart: value.weekStart,
                previousWeekRevision: "3", weekRevision: weekRevision, entries: rows)
        }
        _ = try receipt([posted]).validated(member: member, command: command, proposal: value)
        XCTAssertThrowsError(
            try receipt([posted], weekRevision: "5").validated(member: member, command: command, proposal: value))
        let changed = PostedProposalMeal(
            proposalEntryId: expected.id, entryId: UUID(), date: expected.date, slot: .breakfast)
        XCTAssertThrowsError(try receipt([changed]).validated(member: member, command: command, proposal: value))
        XCTAssertThrowsError(try receipt([]).validated(member: member, command: command, proposal: value))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertThrowsError(try receipt([posted]).validated(member: other, command: command, proposal: value))
    }

    private func proposal() throws -> MealProposal {
        let week = try MealWeekStart("2035-06-04")
        let recipe = RecipeDraft(
            title: "Soup", servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
            ingredients: [.init(name: "Lentils", quantity: nil, unit: nil, categoryId: nil, note: nil)])
        return MealProposal(
            proposalId: UUID(), revision: "1", weekRevision: "3", weekStart: week, familiarOnly: false,
            entries: [
                .init(
                    entryId: UUID(), date: week.date, slot: .dinner, source: .suggested(recipe),
                    estimatedCaloriesPerServing: nil)
            ],
            status: .ready, expiresAt: 2_100_000_000_000, failure: nil)
    }
}
