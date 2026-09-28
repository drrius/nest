import Foundation
import XCTest

@testable import NestCore

final class HostedRecipeEditTests: XCTestCase {
    func testEditReplayDenialPreservesPlannedRecipe() async throws {
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
        let start = try MealWeekStart("2035-06-04")
        do {
            try await verifyPreservation(
                receipt.definitionId, api: api, token: token, outsider: outsider, member: member, start: start)
        } catch {
            try await cleanupMeal(command.recipe.title, start: start, api: api, token: token, member: member)
            try await cleanupRecipe(
                receipt.definitionId, title: command.recipe.title, api: api, token: token, member: member)
            throw error
        }
        try await cleanupMeal(command.recipe.title, start: start, api: api, token: token, member: member)
        try await cleanupRecipe(
            receipt.definitionId, title: command.recipe.title, api: api, token: token, member: member)
    }

    private func verifyPreservation(
        _ id: UUID, api: MealAPI, token: String, outsider: String,
        member: VerifiedMember, start: MealWeekStart
    ) async throws {
        let library = try await api.library(token: token, member: member)
        let fetched = try await api.recipe(token: token, member: member, id: id, revision: library.revision)
        let recipe = try XCTUnwrap(fetched)
        let week = try await api.week(token: token, member: member, start: start)
        let slot = try XCTUnwrap(
            start.days.flatMap { day in MealSlot.allCases.map { (day, $0) } }
                .first { day, slot in !week.entries.contains { $0.date == day && $0.slot == slot } })
        let command = try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: library.revision,
            operationId: UUID(), date: slot.0, slot: slot.1)
        let placed = try await api.placeRecipe(
            token: token, member: member, week: week, recipe: recipe, command: command)
        let plannedWeek = try await api.week(token: token, member: member, start: start)
        let before = try await api.plannedRecipe(token: token, member: member, week: plannedWeek, id: placed.entryId)
        XCTAssertNotNil(before.snapshot)
        let ingredients = try await api.allIngredients(
            token: token, member: member, week: start, revision: plannedWeek.revision)
        let plannedIngredients = ingredients.ingredients.filter { $0.entryId == placed.entryId }
        XCTAssertEqual(plannedIngredients.map(\.name), ["Lentils"])
        XCTAssertEqual(plannedIngredients.first?.quantity, "200")
        XCTAssertEqual(plannedIngredients.first?.unit, "g")
        do {
            _ = try await api.allIngredients(
                token: outsider, member: member, week: start, revision: plannedWeek.revision)
            XCTFail("Outsider read household ingredients")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }

        let ingredient = try XCTUnwrap(recipe.ingredients.first)
        let edit = EditRecipe(
            operationId: UUID(), definitionId: id, expectedRevision: library.revision,
            patch: .init(notes: .some("Edited synthetic note")),
            ingredients: [
                .new(RecipeIngredientDraft(name: "Salt", quantity: nil, unit: nil, categoryId: nil, note: nil)),
                .existing(ingredient.id, .init(quantity: .some(nil))),
            ])
        do {
            _ = try await api.editRecipe(token: outsider, member: member, command: edit)
            XCTFail("Outsider edited household recipe")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let edited = try await api.editRecipe(token: token, member: member, command: edit)
        let replay = try await api.editRecipe(token: token, member: member, command: edit)
        XCTAssertEqual(edited, replay)
        let afterWeek = try await api.week(token: token, member: member, start: start)
        let after = try await api.plannedRecipe(token: token, member: member, week: afterWeek, id: placed.entryId)
        XCTAssertEqual(after, before)
        let currentLibrary = try await api.library(token: token, member: member)
        let updated = try await api.recipe(token: token, member: member, id: id, revision: currentLibrary.revision)
        XCTAssertEqual(updated?.notes, "Edited synthetic note")
        XCTAssertEqual(updated?.ingredients.map(\.name), ["Salt", "Lentils"])
        XCTAssertEqual(updated?.ingredients.last?.id, ingredient.id)
        XCTAssertNil(updated?.ingredients.last?.quantity)
        XCTAssertEqual(updated?.ingredients.last?.unit, "g")
    }

    private func cleanupMeal(_ title: String, start: MealWeekStart, api: MealAPI, token: String, member: VerifiedMember)
        async throws
    {
        let week = try await api.week(token: token, member: member, start: start)
        if let meal = week.entries.first(where: { $0.title == title }) {
            let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
            _ = try await api.remove(token: token, member: member, week: week, meal: meal, command: command)
        }
        let after = try await api.week(token: token, member: member, start: start)
        XCTAssertFalse(after.entries.contains { $0.title == title })
    }

    private func cleanupRecipe(_ id: UUID, title: String, api: MealAPI, token: String, member: VerifiedMember)
        async throws
    {
        let library = try await api.library(token: token, member: member)
        guard let recipe = try await api.recipe(token: token, member: member, id: id, revision: library.revision) else {
            return
        }
        guard recipe.title == title, title.hasPrefix("Synthetic recipe ") else { throw NestAPIFailure.forbidden }
        _ = try await api.archiveRecipe(
            token: token, member: member,
            command: ArchiveRecipe(operationId: UUID(), definitionId: id, expectedRevision: library.revision))
        let fresh = try await api.library(token: token, member: member)
        let inactive = try await api.recipe(token: token, member: member, id: id, revision: fresh.revision)
        XCTAssertNil(inactive)
    }
}
