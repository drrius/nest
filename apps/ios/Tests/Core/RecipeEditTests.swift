import Foundation
import XCTest

@testable import NestCore

final class RecipeEditTests: XCTestCase {
    func testPatchPreservesOmittedFieldsAndExplicitNullAcrossRoundTrip() throws {
        let patch = RecipeMetadataPatch(title: "Soup", servings: .some(nil), notes: .some("Note"))
        let data = try JSONEncoder().encode(patch)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(object["servings"] is NSNull)
        XCTAssertNil(object["instructions"])
        XCTAssertNil(object["recipeUrl"])
        XCTAssertEqual(try JSONDecoder().decode(RecipeMetadataPatch.self, from: data), patch)
        let ingredient = RecipeIngredientPatch(quantity: .some(nil), unit: .some("g"))
        let encoded = try JSONEncoder().encode(ingredient)
        XCTAssertEqual(try JSONDecoder().decode(RecipeIngredientPatch.self, from: encoded), ingredient)
    }

    func testIngredientSelectionWireIsFlatAndRejectsDuplicateExistingIds() throws {
        let id = UUID()
        let added = RecipeIngredientSelection.new(
            RecipeIngredientDraft(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil))
        let data = try JSONEncoder().encode(added)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["kind"] as? String, "new")
        XCTAssertEqual(json["name"] as? String, "Lentils")
        XCTAssertNil(json["draft"])
        XCTAssertEqual(try JSONDecoder().decode(RecipeIngredientSelection.self, from: data), added)
        let duplicate = EditRecipe(
            operationId: UUID(), definitionId: UUID(), expectedRevision: "5", patch: .init(),
            ingredients: [.existing(id, .init()), .existing(id, .init())])
        XCTAssertThrowsError(try duplicate.validated())
    }

    func testNoOpAndReceiptBounds() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let noChange = EditRecipe(
            operationId: UUID(), definitionId: UUID(), expectedRevision: "5", patch: .init(), ingredients: nil)
        XCTAssertThrowsError(try noChange.validated())
        let command = EditRecipe(
            operationId: UUID(), definitionId: UUID(), expectedRevision: "5", patch: .init(title: "Soup"),
            ingredients: nil)
        for revision in ["5", "6", "406"] {
            XCTAssertNoThrow(try receipt(member, command, revision).validated(member: member, command: command))
        }
        for revision in ["4", "407"] {
            XCTAssertThrowsError(try receipt(member, command, revision).validated(member: member, command: command))
        }
        let data = try JSONEncoder().encode(command)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(json["ingredients"] is NSNull)
    }

    private func receipt(_ member: VerifiedMember, _ command: EditRecipe, _ revision: String) -> RecipeEditReceipt {
        RecipeEditReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: command.definitionId,
            previousRevision: command.expectedRevision, revision: revision)
    }
}
