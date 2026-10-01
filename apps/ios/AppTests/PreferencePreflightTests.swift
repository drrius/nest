import Foundation
import XCTest

@testable import Nest

@MainActor
final class PreferencePreflightTests: XCTestCase {
    func testOfflineNewIntentDoesNotWriteOrPersistAndKeepsOriginalBaseline() async throws {
        for kind in PreferenceTestKind.allCases {
            let fixture = try await fixture()
            await fixture.server.goOffline()
            let accepted = await submit(kind, fixture: fixture)
            XCTAssertFalse(accepted)
            try await assertUnchanged(fixture)
        }
    }

    func testChangedServerBaselineIsNotSilentlyRebasedOrJournaled() async throws {
        for kind in PreferenceTestKind.allCases {
            let fixture = try await fixture()
            await fixture.server.changeProfiles()
            let accepted = await submit(kind, fixture: fixture)
            XCTAssertFalse(accepted)
            try await assertUnchanged(fixture)
        }
    }

    func testDelayedPreflightCannotStageAfterSignOutOrMemberSwitch() async throws {
        for kind in PreferenceTestKind.allCases {
            for switchMember in [false, true] {
                let fixture = try await fixture()
                await fixture.server.pauseNextRead()
                let save = Task { await self.submit(kind, fixture: fixture) }
                await fixture.server.waitForRead()
                if switchMember {
                    await fixture.model.signIn(idToken: "B", nonce: "test")
                } else {
                    await fixture.model.signOut()
                }
                await fixture.server.releaseRead()
                let accepted = await save.value
                XCTAssertFalse(accepted)
                let writes = await fixture.server.writes
                XCTAssertEqual(writes, 0)
                if switchMember {
                    XCTAssertEqual(fixture.model.status, .ready(fixture.memberB))
                    let context = try await fixture.model.cachedFoodContext()
                    XCTAssertNil(context.pending)
                    let pending = try await fixture.store.readCookingPreference(lease: XCTUnwrap(fixture.model.lease))
                    XCTAssertNil(pending)
                }
            }
        }
    }

    private func submit(_ kind: PreferenceTestKind, fixture: PreferencePreflightFixture) async -> Bool {
        switch kind {
        case .food:
            do {
                try await fixture.model.stageFoodPreferences(
                    .init(restrictions: ["Vegetarian"], dislikes: [], calorieGoal: nil, portions: 1.5),
                    context: fixture.food)
                return true
            } catch { return false }
        case .cooking:
            return await fixture.model.saveCookingPreferences(fixture.cooking, notes: "My draft", slots: [.dinner])
        }
    }

    private func assertUnchanged(_ fixture: PreferencePreflightFixture) async throws {
        let food = try await fixture.model.cachedFoodContext()
        XCTAssertNil(food.pending)
        XCTAssertEqual(food.profile, fixture.food.profile)
        let lease = try XCTUnwrap(fixture.model.lease)
        let pending = try await fixture.store.readCookingPreference(lease: lease)
        let profile = try await fixture.store.readCookingProfile(lease: lease)
        XCTAssertNil(pending)
        XCTAssertEqual(profile, fixture.cooking.profile)
        XCTAssertNil(fixture.model.cookingPending)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    private func fixture() async throws -> PreferencePreflightFixture {
        let a = UUID()
        let b = UUID()
        let household = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: a, accessToken: "token-A"), nextSignIn: .init(userId: b, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: a, actorB: b, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await chores.respond($0) }
        let server = PreferencePreflightServer(actor: a, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "preflight-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            mealAPI: MealAPI(http: http), foodAPI: FoodAPI(http: http))
        await model.restore()
        let cached = try await model.cachedFoodContext()
        let food = try await model.refreshFoodContext(cached)
        let loaded = await model.loadCookingPreferences()
        let cooking = try XCTUnwrap(loaded)
        return PreferencePreflightFixture(
            model: model, store: store, server: server, food: food, cooking: cooking,
            memberB: .init(userId: b, householdId: household, displayName: "Sam"))
    }
}

private enum PreferenceTestKind: CaseIterable { case food, cooking }

private struct PreferencePreflightFixture {
    let model: SessionModel
    let store: ChoreOfflineStore
    let server: PreferencePreflightServer
    let food: FoodEditContext
    let cooking: CookingEditContext
    let memberB: VerifiedMember
}

private actor PreferencePreflightServer {
    let actor: UUID
    let household: UUID
    var writes = 0
    private var offline = false
    private var changed = false
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }

    func goOffline() { offline = true }
    func changeProfiles() { changed = true }
    func pauseNextRead() { pause = true }
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET" else {
            writes += 1
            throw URLError(.badServerResponse)
        }
        guard !offline else { throw URLError(.notConnectedToInternet) }
        let data = try profileData(request.url?.path)
        if pause {
            pause = false
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resume = $0 }
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!)
    }

    private func profileData(_ path: String?) throws -> Data {
        switch path {
        case "/v1/food-preferences":
            let profile: FoodProfile? =
                changed
                ? .init(
                    revision: "1",
                    preferences: .init(restrictions: [], dislikes: ["Olives"], calorieGoal: nil, portions: 2))
                : nil
            return try JSONEncoder().encode(
                FoodProfileEnvelope(version: 1, actorId: actor, householdId: household, profile: profile))
        case "/v1/cooking-preferences":
            let profile: CookingSlotsEnvelope.Profile? =
                changed
                ? .init(revision: "1", preferences: .init(cookingNotes: "Partner changed this", mealSlots: [.lunch]))
                : nil
            return try JSONEncoder().encode(CookingSlotsEnvelope(version: 1, householdId: household, profile: profile))
        default: throw URLError(.badURL)
        }
    }
}
