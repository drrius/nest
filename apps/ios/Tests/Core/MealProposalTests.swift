import Foundation
import XCTest

@testable import NestCore

final class MealProposalTests: XCTestCase {
    func testRejectsUnreviewableAndIncoherentProposals() throws {
        let meal = try entry()
        _ = try proposal([meal]).validated()
        XCTAssertThrowsError(try proposal(nil).validated())
        XCTAssertThrowsError(try proposal([]).validated())
        XCTAssertThrowsError(try proposal([meal, meal]).validated())
        XCTAssertThrowsError(try proposal([meal], familiar: true).validated())
        XCTAssertThrowsError(try proposal([meal], status: .generating).validated())
        XCTAssertThrowsError(try proposal(nil, status: .failed).validated())
        XCTAssertThrowsError(try proposal([entry(date: "2035-06-11")]).validated())
        XCTAssertThrowsError(try proposal([entry(calories: 20001)]).validated())
        _ = try proposal(nil, status: .generating).validated()
    }

    func testOwnerBindingAndSourceWireRoundtrip() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let value = try proposal([entry()])
        let envelope = MealProposalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, proposal: value)
        _ = try envelope.validated(member: member, id: value.id)
        XCTAssertThrowsError(
            try envelope.validated(
                member: .init(userId: UUID(), householdId: member.householdId, displayName: "Partner"), id: value.id))
        XCTAssertThrowsError(try envelope.validated(member: member, id: UUID()))
        let decoded = try JSONDecoder().decode(MealProposalEnvelope.self, from: JSONEncoder().encode(envelope))
        XCTAssertEqual(decoded, envelope)
    }

    private func entry(date: String = "2035-06-04", calories: Int? = nil) throws -> ProposedMeal {
        ProposedMeal(
            entryId: UUID(), date: try CivilDate(date), slot: .dinner,
            source: .suggested(
                RecipeDraft(
                    title: "Soup", servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
                    ingredients: [.init(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)])),
            estimatedCaloriesPerServing: calories)
    }

    private func proposal(_ entries: [ProposedMeal]?, familiar: Bool = false, status: MealProposal.Status = .ready)
        throws -> MealProposal
    {
        MealProposal(
            proposalId: UUID(), revision: "1", weekRevision: "0", weekStart: try MealWeekStart("2035-06-04"),
            familiarOnly: familiar, entries: entries, status: status, expiresAt: 2_100_000_000_000, failure: nil)
    }
}
