import Foundation
import XCTest

@testable import NestCore

final class RecipeReadStoreTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let savedAt = Date(timeIntervalSince1970: 1_790_985_600)

    func testRestartRetainsVisitedPagesAndRevisionBoundRecipeWithoutCrossingScope() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let library = try await store.beginRecipeRead(.library(member), lease: lease)
        let listing = try listing(51)
        try await store.saveRecipeRead(listing, ticket: library, savedAt: savedAt)
        let recipe = recipe(listing.meals[50].id)
        let detail = try await store.beginRecipeRead(.recipe(member, id: recipe.id, revision: "4"), lease: lease)
        try await store.saveRecipeRead(Optional(recipe), ticket: detail, savedAt: savedAt)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let restored = try await reopened.beginRecipeRead(.library(member), lease: active)
        let saved = try await reopened.readRecipeSnapshot(restored)
        XCTAssertEqual(saved?.value, listing)
        XCTAssertEqual(saved?.savedAt, savedAt)
        let restoredDetail = try await reopened.beginRecipeRead(
            .recipe(member, id: recipe.id, revision: "4"), lease: active)
        let savedDetail = try await reopened.readRecipeSnapshot(restoredDetail)
        XCTAssertEqual(savedDetail?.value, recipe)
        let otherRevision = try await reopened.beginRecipeRead(
            .recipe(member, id: recipe.id, revision: "5"), lease: active)
        let missing = try await reopened.readRecipeSnapshot(otherRevision)
        XCTAssertNil(missing)
        for other in [
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam"),
            VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Alex"),
        ] {
            let foreignLease = try await reopened.activate(other)
            let foreign = try await reopened.beginRecipeRead(.library(other), lease: foreignLease)
            let hidden = try await reopened.readRecipeSnapshot(foreign)
            XCTAssertNil(hidden)
            do {
                try await store.saveRecipeRead(listing, ticket: library, savedAt: savedAt)
                XCTFail("Stale lease wrote another account's cache")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        }
    }

    func testLatestRequestWinsAndRecordedAbsenceReplacesRecipe() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let target = RecipeReadTarget<SavedRecipe?>.recipe(member, id: id(1), revision: "4")
        let old = try await store.beginRecipeRead(target, lease: lease)
        let latest = try await store.beginRecipeRead(target, lease: lease)
        try await store.saveRecipeRead(nil, ticket: latest, savedAt: savedAt)
        try await store.saveRecipeRead(Optional(recipe(id(1))), ticket: old, savedAt: savedAt.addingTimeInterval(1))
        let saved = try await store.readRecipeSnapshot(latest)
        XCTAssertNotNil(saved)
        XCTAssertNil(saved?.value)
        XCTAssertEqual(saved?.savedAt, savedAt)
    }

    func testWrongRecipeAndMalformedListingCannotEnterCache() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let target = try await store.beginRecipeRead(.recipe(member, id: id(1), revision: "4"), lease: lease)
        do {
            try await store.saveRecipeRead(Optional(recipe(id(2))), ticket: target, savedAt: savedAt)
            XCTFail("Accepted a different recipe")
        } catch {
            guard case MealLibraryError.invalidResponse = error else {
                return XCTFail("Unexpected validation error: \(error)")
            }
        }
        let library = try await store.beginRecipeRead(.library(member), lease: lease)
        let raw =
            "{\"householdId\":\"\(member.householdId)\",\"revision\":\"4\",\"meals\":[],\"nextAfterId\":\"\(id(1))\"}"
        let invalid = try JSONDecoder().decode(MealLibraryListing.self, from: Data(raw.utf8))
        do {
            try await store.saveRecipeRead(invalid, ticket: library, savedAt: savedAt)
            XCTFail("Accepted malformed cursor")
        } catch {
            guard case MealLibraryError.invalidResponse = error else {
                return XCTFail("Unexpected validation error: \(error)")
            }
        }
    }

    func testCorruptionFailsClosedAndMembershipRevocationPurgesBothReadCaches() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let ticket = try await store.beginRecipeRead(.library(member), lease: lease)
        try await store.saveRecipeRead(try listing(1), ticket: ticket, savedAt: savedAt)
        let connection = try SQLiteConnection(url: url)
        try connection.run(
            "INSERT INTO money_read_snapshots(actor,household,target,attempt,body) VALUES(?,?,?,?,?)",
            lease.scope + ["balance", UUID().uuidString.lowercased(), "{}"])
        try connection.run("UPDATE recipe_read_snapshots SET body=?", ["{}"])
        do {
            _ = try await store.readRecipeSnapshot(ticket)
            XCTFail("Read corrupt data")
        } catch {}
        try await store.revokeMoneyMembership(lease: lease)
        let moneyRows = try connection.rows(
            "SELECT count(*) FROM money_read_snapshots WHERE actor=? AND household=?", lease.scope)
        XCTAssertEqual(moneyRows.first?.first, "0")
        let restored = try await store.activate(member)
        let restoredTicket = try await store.beginRecipeRead(.library(member), lease: restored)
        let removed = try await store.readRecipeSnapshot(restoredTicket)
        XCTAssertNil(removed)
    }

    func testSameRevisionRefreshRetainsVisitedPagesButNewRevisionDoesNot() throws {
        let visited = try listing(51)
        let first = try listing(50, next: id(50))
        XCTAssertEqual(try visited.retainingVisitedPages(afterRefreshing: first), visited)
        let changed = try listing(50, next: id(50), revision: "5")
        XCTAssertEqual(try visited.retainingVisitedPages(afterRefreshing: changed), changed)
        let complete = try listing(1)
        XCTAssertEqual(try visited.retainingVisitedPages(afterRefreshing: complete), complete)
    }

    func testCopiedForeignBodyCannotMasqueradeAsCurrentAccountCache() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let ticket = try await store.beginRecipeRead(.library(member), lease: lease)
        try await store.saveRecipeRead(try listing(1), ticket: ticket, savedAt: savedAt)
        let connection = try SQLiteConnection(url: url)
        let rows = try connection.rows(
            "SELECT body FROM recipe_read_snapshots WHERE actor=? AND household=?", lease.scope)
        let body = try XCTUnwrap(rows.first?.first)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: Any])
        object["actorId"] = UUID().uuidString
        let foreign = String(decoding: try JSONSerialization.data(withJSONObject: object), as: UTF8.self)
        try connection.run(
            "UPDATE recipe_read_snapshots SET body=? WHERE actor=? AND household=?", [foreign] + lease.scope)
        do {
            _ = try await store.readRecipeSnapshot(ticket)
            XCTFail("Foreign decoded body was displayed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .storage) }
    }

    private func id(_ n: Int) -> UUID {
        UUID(uuidString: "00000000-0000-4000-8000-\(String(format: "%012d", n))")!
    }

    private func recipe(_ id: UUID) -> SavedRecipe {
        SavedRecipe(
            definitionId: id, title: "Fictional soup", servings: 2, recipeUrl: nil, notes: nil, instructions: "Simmer.",
            ingredients: [])
    }

    private func listing(_ count: Int, next: UUID? = nil, revision: String = "4") throws -> MealLibraryListing {
        let all = (1...count).map { SavedMealSummary(definitionId: id($0), title: "Fictional \($0)", servings: 2) }
        let page = try MealLibraryPage(
            version: 1, householdId: member.householdId, revision: revision,
            meals: Array(all.prefix(50)), nextAfterId: count > 50 ? id(50) : next
        )
        .validated(household: member.householdId, after: nil, revision: nil)
        let first = MealLibraryListing(page: page)
        guard count > 50 else { return try first.validated() }
        let tail = try MealLibraryPage(
            version: 1, householdId: member.householdId, revision: revision,
            meals: Array(all.dropFirst(50)), nextAfterId: next
        )
        .validated(household: member.householdId, after: id(50), revision: revision)
        return try first.appending(tail)
    }

    private func database() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "recipe-reads-\(UUID()).sqlite")
    }
}
