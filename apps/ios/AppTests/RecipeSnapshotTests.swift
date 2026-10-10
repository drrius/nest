import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecipeSnapshotTests: XCTestCase {
    func testRestartRecoversLibraryAndRecipeButCannotStageOfflineEdits() async throws {
        let fixture = try RecipeSnapshotFixture()
        let first = try fixture.model()
        let id = try await fixture.seed(first)
        await fixture.failures.failOffline()
        await fixture.chores.makeUnavailable()
        let restarted = try fixture.model()
        await restarted.restore()
        XCTAssertEqual(restarted.status, .ready(fixture.member))
        await restarted.refreshMealLibrary()
        guard case .loaded(let listing) = restarted.mealLibrary else { return XCTFail("Cached library missing") }
        XCTAssertEqual(listing.meals.map(\.title), ["Alex pasta"])
        XCTAssertTrue(restarted.mealLibraryNotice?.contains("Saved information from") == true)
        XCTAssertFalse(restarted.mealLibraryFresh)
        await restarted.loadSavedRecipe(id)
        guard case .loaded(let recipe) = restarted.savedRecipe else { return XCTFail("Cached recipe missing") }
        XCTAssertEqual(recipe.instructions, "Cook and serve.")
        XCTAssertTrue(restarted.savedRecipeNotice?.contains("Saved information from") == true)
        XCTAssertFalse(restarted.savedRecipeFresh)
        do {
            _ = try await restarted.loadRecipeArchiveContext(id)
            XCTFail("Cached recipe enabled a new offline archive")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let mutations = await fixture.failures.mutationCount()
        XCTAssertEqual(mutations, 0)
        let store = try ChoreOfflineStore(url: fixture.url)
        let lease = try await store.activate(fixture.member)
        let archive = try await store.readRecipeArchive(lease: lease)
        XCTAssertNil(archive)
    }

    func testVisitedPagesSurviveSameRevisionRefreshAndOfflineRestart() async throws {
        let fixture = try RecipeSnapshotFixture()
        await fixture.server.usePagedLibrary()
        let model = try fixture.model()
        await model.restore()
        await model.refreshMealLibrary()
        await model.loadNextMealLibraryPage()
        await model.refreshMealLibrary()
        guard case .loaded(let listing) = model.mealLibrary else { return XCTFail("Library missing") }
        XCTAssertEqual(listing.meals.count, 51)
        XCTAssertNil(listing.nextAfterId)
        await fixture.failures.failOffline()
        await fixture.chores.makeUnavailable()
        let restarted = try fixture.model()
        await restarted.restore()
        await restarted.refreshMealLibrary()
        guard case .loaded(let recovered) = restarted.mealLibrary else { return XCTFail("Visited pages missing") }
        XCTAssertEqual(recovered, listing)
    }

    func testAuthoritativeDenialRevokesPersistedScopeAndReadSnapshots() async throws {
        for status in [401, 403] {
            let fixture = try RecipeSnapshotFixture()
            let model = try fixture.model()
            _ = try await fixture.seed(model)
            await fixture.failures.reject(status)
            await model.refreshMealLibrary()
            XCTAssertEqual(model.status, status == 401 ? .signedOut : .notMember)
            let store = try ChoreOfflineStore(url: fixture.url)
            let lease = try await store.persistedMoneyLease(actor: fixture.member.userId)
            XCTAssertNil(lease)
            await fixture.failures.failOffline()
            await fixture.chores.makeUnavailable()
            let restarted = try fixture.model()
            await restarted.restore()
            XCTAssertNotEqual(restarted.status, .ready(fixture.member))
        }
    }

    func testInvalidOrConflictingLiveResponsesDoNotMasqueradeAsSavedSuccess() async throws {
        for status in [400, 409] {
            let fixture = try RecipeSnapshotFixture()
            let model = try fixture.model()
            _ = try await fixture.seed(model)
            await fixture.failures.reject(status)
            await model.refreshMealLibrary()
            XCTAssertEqual(model.mealLibrary, .failed)
        }
        let fixture = try RecipeSnapshotFixture()
        let model = try fixture.model()
        let id = try await fixture.seed(model)
        await fixture.failures.invalidate()
        await model.loadSavedRecipe(id)
        XCTAssertEqual(model.savedRecipe, .failed)
    }

    func testForbiddenRecipeThenVerifiedRemovalPurgesOtherHouseholdReadSnapshots() async throws {
        let fixture = try RecipeSnapshotFixture()
        let model = try fixture.model()
        let id = try await fixture.seed(model)
        let store = try ChoreOfflineStore(url: fixture.url)
        let lease = try XCTUnwrap(model.lease)
        let ticket = try await store.beginMoneyRead(.balance(fixture.member), lease: lease)
        let balance = MoneyBalance(
            version: 1, householdId: fixture.member.householdId, eventCount: "0", openingEstablished: false,
            members: [
                .init(actorId: fixture.member.userId, displayName: "Alex", centimes: try Centimes("0")),
                .init(actorId: fixture.partner, displayName: "Sam", centimes: try Centimes("0")),
            ])
        try await store.saveMoneyRead(balance, ticket: ticket, savedAt: Date())
        await fixture.server.forbidNextRecipe()
        await fixture.failures.rejectMembership()
        await model.loadSavedRecipe(id)
        XCTAssertEqual(model.status, .notMember)
        let persisted = try await store.persistedMoneyLease(actor: fixture.member.userId)
        XCTAssertNil(persisted)
        let rebound = try await store.activate(fixture.member)
        let money = try await store.beginMoneyRead(.balance(fixture.member), lease: rebound)
        let savedMoney = try await store.readMoneySnapshot(money)
        XCTAssertNil(savedMoney)
        let recipe = try await store.beginRecipeRead(.recipe(fixture.member, id: id, revision: "4"), lease: rebound)
        let savedRecipe = try await store.readRecipeSnapshot(recipe)
        XCTAssertNil(savedRecipe)
    }

    func testSDKIdentityChangeCannotExposePreviousAccountCache() async throws {
        let fixture = try RecipeSnapshotFixture()
        let model = try fixture.model()
        _ = try await fixture.seed(model)
        await fixture.auth.queueSessions([AuthenticatedSession(userId: fixture.partner, accessToken: "token-B")])
        _ = try await fixture.auth.session()
        await model.refreshMealLibrary()
        XCTAssertEqual(model.status, .signedOut)
        XCTAssertEqual(model.mealLibrary, .idle)
    }

    func testOldAccountLateSuccessCannotReplaceNewAccountLibrary() async throws {
        let fixture = try RecipeSnapshotFixture()
        let model = try fixture.model()
        _ = try await fixture.seed(model)
        await fixture.server.pauseActorA()
        let delayed = Task { await model.refreshMealLibrary() }
        await fixture.server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "nonce-B")
        await model.refreshMealLibrary()
        await fixture.server.releaseActorA()
        await delayed.value
        guard case .loaded(let listing) = model.mealLibrary else { return XCTFail("New account library missing") }
        XCTAssertEqual(listing.meals.map(\.title), ["Sam soup"])
        XCTAssertEqual(
            model.status,
            .ready(VerifiedMember(userId: fixture.partner, householdId: fixture.member.householdId, displayName: "Sam"))
        )
    }
}
