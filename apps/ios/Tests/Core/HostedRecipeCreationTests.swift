import Foundation
import XCTest

@testable import NestCore

final class HostedRecipeCreationTests: XCTestCase {
    func testCreateReplayDenialReadAndArchive() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: url)!)
        let api = MealAPI(http: http)
        let member = try await api.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let library = try await api.library(token: token, member: member)
        let command = CreateRecipe(
            operationId: UUID(), expectedRevision: library.revision,
            recipe: RecipeDraft(
                title: "Synthetic recipe \(UUID())", servings: 2,
                instructions: "Simmer lentils until tender.", recipeUrl: nil, notes: nil,
                ingredients: [
                    RecipeIngredientDraft(name: "Lentils", quantity: "200", unit: "g", categoryId: nil, note: nil)
                ]))
        do {
            _ = try await api.createRecipe(token: outsider, member: member, command: command)
            XCTFail("Outsider created a household recipe")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.createRecipe(token: token, member: member, command: command)
        do {
            let replay = try await api.createRecipe(token: token, member: member, command: command)
            XCTAssertEqual(receipt, replay)
            let fresh = try await api.library(token: token, member: member)
            let recipe = try await api.recipe(
                token: token, member: member, id: receipt.definitionId, revision: fresh.revision)
            XCTAssertEqual(recipe?.title, command.recipe.title)
            XCTAssertEqual(recipe?.instructions, command.recipe.instructions)
            XCTAssertEqual(recipe?.servings, 2)
            XCTAssertEqual(recipe?.ingredients.map(\.name), ["Lentils"])
            XCTAssertEqual(recipe?.ingredients.first?.quantity, "200")
            XCTAssertEqual(recipe?.ingredients.first?.unit, "g")
            let stale = CreateRecipe(
                operationId: UUID(), expectedRevision: command.expectedRevision, recipe: command.recipe)
            do {
                _ = try await api.createRecipe(token: token, member: member, command: stale)
                XCTFail("Accepted stale library revision")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        } catch {
            try await archive(
                receipt.definitionId, title: command.recipe.title, token: token, member: member, http: http, api: api)
            throw error
        }
        try await archive(
            receipt.definitionId, title: command.recipe.title, token: token, member: member, http: http, api: api)
    }

    private func archive(_ id: UUID, title: String, token: String, member: VerifiedMember, http: NestHTTP, api: MealAPI)
        async throws
    {
        let library = try await api.library(token: token, member: member)
        let recipe = try await api.recipe(token: token, member: member, id: id, revision: library.revision)
        guard recipe?.title == title, title.hasPrefix("Synthetic recipe ") else { throw NestAPIFailure.forbidden }
        let operation = UUID()
        let result = try await http.write(
            "v1/meals/recipe/archive", token: token, household: member.householdId,
            body: ArchiveFixture(operationId: operation, definitionId: id, expectedRevision: library.revision),
            as: RecipeCreationEnvelope.self)
        XCTAssertEqual(result.version, 1)
        XCTAssertEqual(result.receipt.actorId, member.userId)
        XCTAssertEqual(result.receipt.householdId, member.householdId)
        XCTAssertEqual(result.receipt.operationId, operation)
        XCTAssertEqual(result.receipt.definitionId, id)
        let fresh = try await api.library(token: token, member: member)
        let removed = try await api.recipe(token: token, member: member, id: id, revision: fresh.revision)
        XCTAssertNil(removed, "Synthetic recipe remains active")
    }
}

private struct ArchiveFixture: Encodable {
    let operationId: UUID
    let definitionId: UUID
    let expectedRevision: String
}
