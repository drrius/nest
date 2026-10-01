import Foundation
import XCTest

@testable import NestCore

final class MealRecipeReplacementTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
    private let start = try! MealWeekStart("2026-09-28")
    private let oldId = UUID()
    private let newId = UUID()
    private let recipeId = UUID()

    private var recipe: SavedRecipe {
        SavedRecipe(
            definitionId: recipeId, title: "Soup", servings: 2, recipeUrl: nil, notes: "Saved note",
            instructions: "Simmer",
            ingredients: [
                SavedIngredient(
                    ingredientId: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
                    name: "Lentils", quantity: "100", unit: "g", categoryId: nil, note: nil, order: 0)
            ])
    }

    private func week(_ revision: String = "7", replaced: Bool = false) -> MealWeekSnapshot {
        let entry = PlannedMeal(
            entryId: replaced ? newId : oldId, date: start.date, slot: .dinner,
            title: replaced ? recipe.title : "Pasta", recipeUrl: nil,
            notes: replaced ? recipe.notes : nil, definitionId: replaced ? recipeId : nil, leftoverSourceId: nil)
        return MealWeekSnapshot(
            version: 1, householdId: member.householdId, weekStart: start, revision: revision, entries: [entry])
    }

    private func command() throws -> ReplaceSavedRecipe {
        try ReplaceSavedRecipe(
            week: week(), meal: week().entries[0], recipe: recipe, libraryRevision: "3", operationId: UUID())
    }

    private func receipt(_ command: ReplaceSavedRecipe) -> MealRecipeReplacementReceipt {
        MealRecipeReplacementReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, previousEntryId: oldId, entryId: newId, weekStart: start,
            date: start.date, slot: .dinner, revision: "9", definitionId: recipeId, libraryRevision: "3",
            skippedPreparationId: UUID())
    }

    func testExactReceiptRejectsScopeTargetRevisionAndLibraryDrift() throws {
        let command = try command()
        let valid = receipt(command)
        XCTAssertNoThrow(try valid.validated(member: member, command: command))
        let data = try JSONEncoder().encode(valid)
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        for (key, value) in [
            "actorId": UUID().uuidString, "householdId": UUID().uuidString,
            "operationId": UUID().uuidString, "previousEntryId": UUID().uuidString,
            "entryId": oldId.uuidString, "definitionId": UUID().uuidString,
            "revision": "8", "libraryRevision": "4", "date": "2026-09-29", "slot": "lunch",
        ] {
            var invalid = body
            invalid[key] = value
            let decoded = try JSONDecoder().decode(
                MealRecipeReplacementReceipt.self, from: JSONSerialization.data(withJSONObject: invalid))
            XCTAssertThrowsError(try decoded.validated(member: member, command: command), key)
        }
        XCTAssertThrowsError(
            try ReplaceSavedRecipe(
                week: week(String(Int64.max - 1)), meal: week().entries[0],
                recipe: recipe, libraryRevision: "3", operationId: UUID()))
    }

    func testSQLiteRestartScopesPendingAndRequiresExactRetainedRecipeBeforeClearing() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "recipe-replacement-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = try command()
        let saved = SavedMealRecipeReplacement(
            week: week(), meal: week().entries[0], recipe: recipe,
            command: command, state: .pending, receipt: nil)
        try await store.saveMealWeek(week(), lease: lease)
        try await store.enqueueMealRecipeReplacement(saved, lease: lease)
        do {
            try await store.discardConflictedMealRecipeReplacement(lease: lease)
            XCTFail("Pending discarded")
        } catch {}
        let restarted = try ChoreOfflineStore(url: url)
        let next = try await restarted.activate(member)
        let restored = try await restarted.readMealRecipeReplacement(lease: next)
        XCTAssertEqual(restored, saved)
        do {
            _ = try await store.readMealRecipeReplacement(lease: lease)
            XCTFail("Old lease accepted")
        } catch {}
        let other = try await restarted.activate(
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await restarted.readMealRecipeReplacement(lease: other)
        XCTAssertNil(hidden)
        let own = try await restarted.activate(member)
        try await restarted.acknowledgeMealRecipeReplacement(receipt(command), lease: own)
        do {
            try await restarted.conflictMealRecipeReplacement(command.operationId, lease: own)
            XCTFail("Confirmed downgraded")
        } catch {}
        try await restarted.clearConfirmedMealRecipeReplacement(week("9", replaced: true), retained: nil, lease: own)
        let retainedPending = try await restarted.readMealRecipeReplacement(lease: own)
        XCTAssertEqual(retainedPending?.state, .acknowledged)
        let current = week("9", replaced: true)
        let snapshot = PlannedRecipeSnapshot(
            libraryRevision: "3",
            recipe: RetainedRecipe(
                definitionId: recipeId,
                title: recipe.title, servings: recipe.servings, recipeUrl: recipe.recipeUrl, notes: recipe.notes,
                instructions: recipe.instructions, ingredients: recipe.ingredients))
        let envelope = PlannedRecipeEnvelope(
            version: 1, householdId: member.householdId, weekStart: start,
            revision: "9", entry: current.entries[0], snapshot: snapshot)
        try await restarted.clearConfirmedMealRecipeReplacement(current, retained: envelope, lease: own)
        let cleared = try await restarted.readMealRecipeReplacement(lease: own)
        XCTAssertNil(cleared)
    }

    func testAssistantLinkRequiresCanonicalInputAndOwnSuccessfulReceipt() throws {
        let command = try command()
        let receipt = receipt(command)
        var input = try JSONDecoder().decode([String: AssistantJSON].self, from: JSONEncoder().encode(command))
        input.removeValue(forKey: "operationId")
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-replaceWithRecipe"),
            "state": .string("output-available"), "input": .object(input),
            "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantMealRecipeReplacementLink.receipt(part, member: member), receipt)
        input["entryId"] = .string(UUID().uuidString)
        part["input"] = .object(input)
        XCTAssertNil(AssistantMealRecipeReplacementLink.receipt(part, member: member))
        part.removeValue(forKey: "input")
        XCTAssertNil(AssistantMealRecipeReplacementLink.receipt(part, member: member))
    }

    func testSwiftWireFixtureMatchesEncodedCommandAndRetainedRecipe() throws {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "meal-recipe-replacement", withExtension: "json", subdirectory: "Fixtures"))
        let fixture = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let commandBody = try JSONSerialization.data(withJSONObject: fixture["command"]!)
        let command = try JSONDecoder().decode(ReplaceSavedRecipe.self, from: commandBody)
        let receipt = try JSONDecoder().decode(
            MealRecipeReplacementReceipt.self,
            from: JSONSerialization.data(withJSONObject: fixture["receipt"]!))
        let retained = try JSONDecoder().decode(
            PlannedRecipeEnvelope.self,
            from: JSONSerialization.data(withJSONObject: fixture["retained"]!))
        let member = VerifiedMember(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Fixture")
        XCTAssertNoThrow(try receipt.validated(member: member, command: command))
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(command)) as? NSDictionary)
        XCTAssertEqual(encoded, fixture["command"] as? NSDictionary)
        let entry = try XCTUnwrap(retained.entry)
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId, weekStart: command.weekStart,
            revision: receipt.revision, entries: [entry])
        XCTAssertNoThrow(try retained.validated(against: week, id: receipt.entryId))
        XCTAssertEqual(retained.snapshot?.libraryRevision, command.expectedLibraryRevision)
        XCTAssertEqual(retained.snapshot?.recipe.ingredients.first?.quantity, "100")
    }
}
