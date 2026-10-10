import Foundation
import XCTest

@testable import NestCore

final class AssistantRecipeLinkTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
    private let definition = UUID()

    func testCreateRequiresCanonicalInputAndExactReceiptRevision() throws {
        let command = CreateRecipe(
            operationId: UUID(), expectedRevision: "5",
            recipe: .init(
                title: "Soup", servings: 2, instructions: "Simmer.", recipeUrl: nil, notes: nil,
                ingredients: [.init(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)]))
        let receipt = RecipeCreationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: definition, revision: "7")
        var part = try tool("createRecipe", command: command, receipt: receipt)
        XCTAssertEqual(AssistantRecipeLink.read(part, member: member), .init(definitionId: definition, action: .saved))
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
        part = try tool("createRecipe", command: command, receipt: receipt)
        part.removeValue(forKey: "input")
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
        part = try tool("createRecipe", command: command, receipt: receipt)
        var input = try object(command)
        input["expectedRevision"] = .string("6")
        input.removeValue(forKey: "operationId")
        part["input"] = .object(input)
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
    }

    func testEditBindsTargetPreviousRevisionAndOwnPrivateScope() throws {
        let command = EditRecipe(
            operationId: UUID(), definitionId: definition, expectedRevision: "7",
            patch: .init(instructions: .some(nil)), ingredients: nil)
        let receipt = RecipeEditReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: definition, previousRevision: "7", revision: "8")
        var part = try tool("editRecipe", command: command, receipt: receipt)
        XCTAssertEqual(AssistantRecipeLink.read(part, member: member)?.definitionId, definition)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertNil(AssistantRecipeLink.read(part, member: partner))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other household")
        XCTAssertNil(AssistantRecipeLink.read(part, member: foreign))
        var input = try object(command)
        input.removeValue(forKey: "operationId")
        input["definitionId"] = .string(UUID().uuidString)
        part["input"] = .object(input)
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
        part = try tool("editRecipe", command: command, receipt: receipt)
        input = try object(command)
        part["input"] = .object(input)
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
    }

    func testArchiveDoesNotPromiseCurrentAbsenceAndRejectsFailedOrWrongTool() throws {
        let command = ArchiveRecipe(operationId: UUID(), definitionId: definition, expectedRevision: "8")
        let receipt = RecipeArchiveReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, definitionId: definition, revision: "9")
        var part = try tool("archiveRecipe", command: command, receipt: receipt)
        XCTAssertEqual(AssistantRecipeLink.read(part, member: member)?.action, .archived)
        part["type"] = .string("tool-editRecipe")
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
        part = try tool("archiveRecipe", command: command, receipt: receipt)
        part["output"] = .object(["ok": .bool(false), "value": .object(try object(receipt))])
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
        part = try tool("archiveRecipe", command: command, receipt: receipt)
        part["state"] = .string("output-error")
        XCTAssertNil(AssistantRecipeLink.read(part, member: member))
    }

    private func tool<C: Encodable, R: Encodable>(_ name: String, command: C, receipt: R) throws -> [String:
        AssistantJSON]
    {
        var input = try object(command)
        input.removeValue(forKey: "operationId")
        return [
            "type": .string("tool-\(name)"), "state": .string("output-available"),
            "input": .object(input), "output": .object(["ok": .bool(true), "value": .object(try object(receipt))]),
        ]
    }

    private func object<T: Encodable>(_ value: T) throws -> [String: AssistantJSON] {
        guard case .object(let object) = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(value))
        else { throw MealContractError.invalidReceipt }
        return object
    }
}
