import Foundation
import XCTest

@testable import NestCore

final class PlannedRecipeTests: XCTestCase {
    func testOrphanedSnapshotAndEmptyGeneratedRecipeAreRejected() throws {
        var orphan = try PlannedRecipeFixture.object(PlannedRecipeFixture.detail())
        orphan["entry"] = NSNull()
        XCTAssertThrowsError(
            try PlannedRecipeFixture.decode(orphan).validated(
                household: PlannedRecipeFixture.household, start: PlannedRecipeFixture.start,
                id: PlannedRecipeFixture.entry))
        var generated = try PlannedRecipeFixture.object(PlannedRecipeFixture.detail(generated: true))
        var snapshot = try XCTUnwrap(generated["snapshot"] as? [String: Any])
        var recipe = try XCTUnwrap(snapshot["recipe"] as? [String: Any])
        recipe["ingredients"] = []
        snapshot["recipe"] = recipe
        generated["snapshot"] = snapshot
        XCTAssertThrowsError(
            try PlannedRecipeFixture.decode(generated).validated(
                against: PlannedRecipeFixture.week(generated: true), id: PlannedRecipeFixture.entry))
    }

    func testSavedGeneratedAndMissingHistoricalDetailsRemainDistinct() throws {
        let saved = try PlannedRecipeFixture.detail()
        XCTAssertEqual(try saved.validated(against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry), saved)
        XCTAssertEqual(saved.snapshot?.recipe.content.ingredients.first?.quantity, "1.5")
        let generated = try PlannedRecipeFixture.detail(generated: true)
        _ = try generated.validated(against: PlannedRecipeFixture.week(generated: true), id: PlannedRecipeFixture.entry)
        XCTAssertNil(generated.snapshot?.recipe.definitionId)
        XCTAssertNil(generated.snapshot?.libraryRevision)
        let historical = try PlannedRecipeFixture.detail(retained: false)
        _ = try historical.validated(against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry)
        XCTAssertNotNil(historical.entry)
        XCTAssertNil(historical.snapshot)
        let missing = try PlannedRecipeFixture.detail(missing: true)
        _ = try missing.validated(against: PlannedRecipeFixture.week(missing: true), id: PlannedRecipeFixture.entry)
        XCTAssertNil(missing.entry)
        XCTAssertNil(missing.snapshot)
    }

    func testEnvelopeRejectsWrongTenantEntryWeekRevisionAndBaseline() throws {
        let valid = try PlannedRecipeFixture.detail()
        for (key, value) in [
            ("householdId", UUID().uuidString), ("weekStart", "2026-10-05"),
            ("revision", "01"), ("revision", "2"),
        ] {
            var object = try PlannedRecipeFixture.object(valid)
            object[key] = value
            let changed = try PlannedRecipeFixture.decode(object)
            XCTAssertThrowsError(
                try changed.validated(against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry))
        }
        var object = try PlannedRecipeFixture.object(valid)
        var entry = try XCTUnwrap(object["entry"] as? [String: Any])
        for (key, value) in [("entryId", UUID().uuidString), ("date", "2026-10-06"), ("title", "Different meal")] {
            var changed = entry
            changed[key] = value
            object["entry"] = changed
            XCTAssertThrowsError(
                try PlannedRecipeFixture.decode(object).validated(
                    against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry))
        }
        entry["slot"] = "lunch"
        object["entry"] = entry
        object["snapshot"] = NSNull()
        XCTAssertThrowsError(
            try PlannedRecipeFixture.decode(object).validated(
                against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry))
    }

    func testRetainedRecipeMustMatchThePlannedEntryAndItsOrigin() throws {
        let valid = try PlannedRecipeFixture.detail()
        for key in ["definitionId", "title", "recipeUrl", "notes"] {
            var object = try PlannedRecipeFixture.object(valid)
            var snapshot = try XCTUnwrap(object["snapshot"] as? [String: Any])
            var recipe = try XCTUnwrap(snapshot["recipe"] as? [String: Any])
            recipe[key] = key == "definitionId" ? UUID().uuidString : "changed"
            snapshot["recipe"] = recipe
            object["snapshot"] = snapshot
            XCTAssertThrowsError(
                try PlannedRecipeFixture.decode(object).validated(
                    against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry))
        }
        var object = try PlannedRecipeFixture.object(valid)
        var snapshot = try XCTUnwrap(object["snapshot"] as? [String: Any])
        snapshot["libraryRevision"] = NSNull()
        object["snapshot"] = snapshot
        XCTAssertThrowsError(
            try PlannedRecipeFixture.decode(object).validated(
                against: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry))
        object = try PlannedRecipeFixture.object(PlannedRecipeFixture.detail(generated: true))
        snapshot = try XCTUnwrap(object["snapshot"] as? [String: Any])
        snapshot["libraryRevision"] = "4"
        object["snapshot"] = snapshot
        XCTAssertThrowsError(
            try PlannedRecipeFixture.decode(object).validated(
                against: PlannedRecipeFixture.week(generated: true), id: PlannedRecipeFixture.entry))
    }

    func testPlannedRecipeAPIUsesFreshWeekRevisionAndAuthorizedHousehold() async throws {
        let member = PlannedRecipeFixture.member
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer test-token")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "X-Nest-Household"), member.householdId.uuidString.lowercased())
            XCTAssertEqual(
                request.url?.query,
                "entryId=\(PlannedRecipeFixture.entry.uuidString.lowercased())&weekStart=2026-09-28&revision=1")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (try JSONEncoder().encode(PlannedRecipeFixture.detail()), response)
        }
        let result = try await MealAPI(http: http).plannedRecipe(
            token: "test-token", member: member,
            week: PlannedRecipeFixture.week(), id: PlannedRecipeFixture.entry)
        XCTAssertEqual(result.snapshot?.recipe.title, "Original lentil bowl")
    }
}

enum PlannedRecipeFixture {
    static let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    static let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    static let entry = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    static let definition = UUID(uuidString: "66666666-6666-4666-8666-666666666666")!
    static let start = try! MealWeekStart("2026-09-28")
    static var member: VerifiedMember { VerifiedMember(userId: actor, householdId: household, displayName: "Test") }

    static func detail(
        generated: Bool = false, retained: Bool = true, missing: Bool = false, revision: String = "1"
    ) throws -> PlannedRecipeEnvelope {
        let ingredient = SavedIngredient(
            ingredientId: UUID(uuidString: "77777777-7777-4777-8777-777777777777")!,
            name: "Lentils", quantity: "1.5", unit: "cups", categoryId: nil, note: "Rinse first", order: 0)
        let meal = PlannedMeal(
            entryId: entry, date: try CivilDate("2026-09-29"), slot: .dinner,
            title: "Original lentil bowl", recipeUrl: nil, notes: nil,
            definitionId: generated ? nil : definition, leftoverSourceId: nil)
        let recipe = RetainedRecipe(
            definitionId: meal.definitionId, title: meal.title, servings: 2,
            recipeUrl: meal.recipeUrl, notes: meal.notes, instructions: "Simmer and serve.", ingredients: [ingredient])
        return PlannedRecipeEnvelope(
            version: 1, householdId: household, weekStart: start, revision: revision,
            entry: missing ? nil : meal,
            snapshot: retained && !missing
                ? PlannedRecipeSnapshot(libraryRevision: generated ? nil : "4", recipe: recipe) : nil)
    }

    static func week(generated: Bool = false, missing: Bool = false) throws -> MealWeekSnapshot {
        let value = try detail(generated: generated, missing: missing)
        return MealWeekSnapshot(
            version: 1, householdId: household, weekStart: start, revision: value.revision,
            entries: value.entry.map { [$0] } ?? [])
    }

    static func object(_ value: PlannedRecipeEnvelope) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }

    static func decode(_ object: [String: Any]) throws -> PlannedRecipeEnvelope {
        try JSONDecoder().decode(PlannedRecipeEnvelope.self, from: JSONSerialization.data(withJSONObject: object))
    }
}
