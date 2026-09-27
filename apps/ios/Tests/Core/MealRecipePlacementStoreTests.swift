import Foundation
import XCTest

@testable import NestCore

final class MealRecipePlacementStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let definition = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let entry = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private let start = try! MealWeekStart("2026-09-28")

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testPendingRecipePlacementSurvivesRestartAndBlocksAnotherPlacement() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "0", placed: false)
        let recipe = try savedRecipe()
        let command = try place(week: week, recipe: recipe)
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealRecipePlacement(week, recipe: recipe, command: command, lease: lease)

        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let foreign = try await reopened.readMealRecipePlacement(start, lease: outsiderLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readMealRecipePlacement(start, lease: lease)
            XCTFail("Old lease read another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readMealRecipePlacement(start, lease: restored)
        XCTAssertEqual(saved?.state, .pending)
        XCTAssertEqual(saved?.command, command)
        let oneOff = try PlaceMeal(
            week: week, operationId: UUID(), date: try CivilDate("2026-09-30"),
            slot: .dinner, title: "Soup")
        do {
            try await reopened.enqueueMealPlacement(week, command: oneOff, lease: restored)
            XCTFail("One-off placement bypassed a pending saved recipe")
        } catch { XCTAssertEqual(error as? OfflineFailure, .missingSnapshot) }
    }

    func testAcknowledgedRecipePlacementWaitsForObservedWeek() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let old = try snapshot(revision: "0", placed: false)
        let recipe = try savedRecipe()
        let command = try place(week: old, recipe: recipe)
        try await store.saveMealWeek(old, lease: lease)
        try await store.enqueueMealRecipePlacement(old, recipe: recipe, command: command, lease: lease)
        try await store.acknowledgeMealRecipePlacement(try receipt(command), lease: lease)
        try await store.saveMealWeek(old, lease: lease)
        let waiting = try await store.readMealRecipePlacement(start, lease: lease)
        XCTAssertEqual(waiting?.state, .acknowledged)
        try await store.saveMealWeek(try snapshot(revision: "1", placed: true), lease: lease)
        let cleared = try await store.readMealRecipePlacement(start, lease: lease)
        XCTAssertNil(cleared)
    }

    func testRejectedRecipePlacementRequiresExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "meal-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let week = try snapshot(revision: "0", placed: false)
        let recipe = try savedRecipe()
        let command = try place(week: week, recipe: recipe)
        try await store.saveMealWeek(week, lease: lease)
        try await store.enqueueMealRecipePlacement(week, recipe: recipe, command: command, lease: lease)
        try await store.conflictMealRecipePlacement(command.operationId, week: start, lease: lease)
        try await store.saveMealWeek(try snapshot(revision: "1", placed: true), lease: lease)
        let rejected = try await store.readMealRecipePlacement(start, lease: lease)
        XCTAssertEqual(rejected?.state, .conflict)
        try await store.discardConflictedMealRecipePlacement(start, lease: lease)
        let discarded = try await store.readMealRecipePlacement(start, lease: lease)
        XCTAssertNil(discarded)
    }

    private func place(week: MealWeekSnapshot, recipe: SavedRecipe) throws -> PlaceSavedRecipe {
        try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: "3",
            operationId: UUID(), date: CivilDate("2026-09-29"), slot: .dinner)
    }

    private func snapshot(revision: String, placed: Bool) throws -> MealWeekSnapshot {
        let row = """
            {"entryId":"\(entry)","date":"2026-09-29","slot":"dinner","title":"Pasta","recipeUrl":null,"notes":null,"definitionId":"\(definition)","leftoverSourceId":null}
            """
        let body = """
            {"version":1,"householdId":"\(household)","weekStart":"2026-09-28","revision":"\(revision)","entries":[\(placed ? row : "")]}
            """
        return try JSONDecoder().decode(MealWeekSnapshot.self, from: Data(body.utf8))
    }

    private func savedRecipe() throws -> SavedRecipe {
        let body = """
            {"definitionId":"\(definition)","title":"Pasta","servings":2,"recipeUrl":null,"notes":null,"instructions":"Cook it.","ingredients":[]}
            """
        return try JSONDecoder().decode(SavedRecipe.self, from: Data(body.utf8))
    }

    private func receipt(_ command: PlaceSavedRecipe) throws -> MealRecipePlacementReceipt {
        let body = """
            {"version":1,"actorId":"\(actor)","householdId":"\(household)","operationId":"\(command.operationId)","entryId":"\(entry)","weekStart":"2026-09-28","date":"2026-09-29","slot":"dinner","revision":"1","definitionId":"\(definition)","libraryRevision":"3"}
            """
        return try JSONDecoder().decode(MealRecipePlacementReceipt.self, from: Data(body.utf8))
    }
}
