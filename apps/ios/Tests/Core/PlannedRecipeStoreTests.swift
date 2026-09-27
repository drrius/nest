import Foundation
import XCTest

@testable import NestCore

final class PlannedRecipeStoreTests: XCTestCase {
    func testRetainedDetailsSurviveRestartAndStayAccountScoped() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "planned-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(PlannedRecipeFixture.member)
        let value = try PlannedRecipeFixture.detail()
        try await store.savePlannedRecipe(value, id: PlannedRecipeFixture.entry, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let other = VerifiedMember(userId: UUID(), householdId: lease.household, displayName: "Other")
        let otherLease = try await reopened.activate(other)
        let absent = try await reopened.readPlannedRecipe(
            PlannedRecipeFixture.entry, start: PlannedRecipeFixture.start, lease: otherLease)
        XCTAssertNil(absent)
        do {
            _ = try await store.readPlannedRecipe(
                PlannedRecipeFixture.entry, start: PlannedRecipeFixture.start, lease: lease)
            XCTFail("Invalidated account lease read retained details")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(PlannedRecipeFixture.member)
        let saved = try await reopened.readPlannedRecipe(
            PlannedRecipeFixture.entry, start: PlannedRecipeFixture.start, lease: restored)
        XCTAssertEqual(saved, value)
        let otherWeek = try await reopened.readPlannedRecipe(
            PlannedRecipeFixture.entry, start: PlannedRecipeFixture.start.adjacent(1), lease: restored)
        XCTAssertNil(otherWeek)
    }

    func testFreshAbsenceReplacesCachedRecipeAndOlderRepliesCannotRestoreIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "planned-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(PlannedRecipeFixture.member)
        let original = try PlannedRecipeFixture.detail()
        try await store.savePlannedRecipe(original, id: PlannedRecipeFixture.entry, lease: lease)
        let missing = try PlannedRecipeFixture.detail(missing: true, revision: "2")
        try await store.savePlannedRecipe(missing, id: PlannedRecipeFixture.entry, lease: lease)
        try await store.savePlannedRecipe(original, id: PlannedRecipeFixture.entry, lease: lease)
        let saved = try await store.readPlannedRecipe(
            PlannedRecipeFixture.entry, start: PlannedRecipeFixture.start, lease: lease)
        XCTAssertEqual(saved, missing)
    }

    func testCacheRejectsWrongTenantAndEntryPointer() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "planned-recipe-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Other"))
        do {
            try await store.savePlannedRecipe(
                PlannedRecipeFixture.detail(), id: PlannedRecipeFixture.entry, lease: lease)
            XCTFail("Cached another tenant's planned recipe")
        } catch { XCTAssertTrue(error is MealLibraryError) }
        let own = try await store.activate(PlannedRecipeFixture.member)
        do {
            try await store.savePlannedRecipe(PlannedRecipeFixture.detail(), id: UUID(), lease: own)
            XCTFail("Cached a recipe under the wrong planned entry")
        } catch { XCTAssertTrue(error is MealLibraryError) }
    }
}
