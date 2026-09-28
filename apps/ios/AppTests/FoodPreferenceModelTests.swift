import Foundation
import XCTest

@testable import Nest

@MainActor
final class FoodPreferenceModelTests: XCTestCase {
    func testLostReplyExactRetryAndAccountIsolation() async throws {
        let a = UUID()
        let b = UUID()
        let household = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: a, accessToken: "token-A"), nextSignIn: .init(userId: b, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: a, actorB: b, household: household)
        let server = FoodPreferenceTestServer(actor: a, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "food-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            foodAPI: FoodAPI(http: http))
        await model.restore()
        let cached = try await model.cachedFoodContext()
        let context = try await model.refreshFoodContext(cached)
        XCTAssertNil(context.profile?.profile)
        let preferences = FoodPreferences(
            restrictions: ["Vegetarian"], dislikes: ["Olives"], calorieGoal: nil, portions: 1.5)
        try await model.stageFoodPreferences(preferences, context: context)
        do {
            _ = try await model.retryFoodPreferences(context)
            XCTFail("Expected lost reply")
        } catch {}
        let waiting = try await model.cachedFoodContext()
        XCTAssertEqual(waiting.pending?.command.preferences, preferences)
        let confirmed = try await model.retryFoodPreferences(waiting)
        XCTAssertNil(confirmed.pending)
        XCTAssertEqual(confirmed.profile?.profile?.preferences, preferences)
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
        await model.signIn(idToken: "B", nonce: "test")
        let hidden = try await model.cachedFoodContext()
        XCTAssertNil(hidden.profile)
        XCTAssertNil(hidden.pending)
        do {
            try await model.stageFoodPreferences(preferences, context: context)
            XCTFail("Saved from old account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
    }
}

actor FoodPreferenceTestServer {
    let actor: UUID
    let household: UUID
    var calls: [SaveFoodPreferences] = []
    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let data: Data
        if request.url?.path == "/v1/food-preferences/save" {
            let command = try JSONDecoder().decode(SaveFoodPreferences.self, from: request.httpBody!)
            calls.append(command)
            if calls.count == 1 { throw URLError(.networkConnectionLost) }
            struct Envelope: Encodable {
                let version = 1
                let receipt: FoodPreferenceReceipt
            }
            data = try JSONEncoder().encode(
                Envelope(
                    receipt: .init(
                        actorId: actor, householdId: household, operationId: command.operationId, revision: "1")))
        } else {
            let profile = calls.last.map { FoodProfile(revision: "1", preferences: $0.preferences) }
            data = try JSONEncoder().encode(
                FoodProfileEnvelope(version: 1, actorId: actor, householdId: household, profile: profile))
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!)
    }
}
