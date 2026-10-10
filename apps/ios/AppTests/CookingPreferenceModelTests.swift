import Foundation
import XCTest

@testable import Nest

@MainActor
final class CookingPreferenceModelTests: XCTestCase {
    private let actorA = UUID()
    private let actorB = UUID()
    private let household = UUID()

    func testLostResponseRetriesExactSaveAndUpdatesVisibleSlots() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let loaded = await model.loadCookingPreferences()
        let context = try XCTUnwrap(loaded)
        await server.loseReply()
        let accepted = await model.saveCookingPreferences(context, notes: "Quick dinners", slots: [.dinner])
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.cookingPending?.state, .pending)
        await model.retryCookingPreferences()
        XCTAssertNil(model.cookingPending)
        XCTAssertEqual(model.mealVisibleSlots, [.dinner])
        XCTAssertEqual(model.cookingProfile?.profile?.preferences.cookingNotes, "Quick dinners")
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 2)
        XCTAssertEqual(attempts.first, attempts.last)
    }

    func testLateBoardReadCannotUndoNewPreferences() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let loaded = await model.loadCookingPreferences()
        let context = try XCTUnwrap(loaded)
        await server.pauseRead()
        let oldRead = Task { await model.refreshMealVisibleSlots() }
        await server.waitForRead()
        _ = await model.saveCookingPreferences(context, notes: "New", slots: [.dinner])
        await server.releaseRead()
        await oldRead.value
        XCTAssertEqual(model.mealVisibleSlots, [.dinner])
        XCTAssertEqual(model.cookingProfile?.profile?.preferences.cookingNotes, "New")
    }

    func testOldAccountEditorCannotSubmit() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let loaded = await model.loadCookingPreferences()
        let context = try XCTUnwrap(loaded)
        await model.signIn(idToken: "B", nonce: "test")
        let accepted = await model.saveCookingPreferences(context, notes: "Old account", slots: [.lunch])
        XCTAssertFalse(accepted)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
        XCTAssertNil(model.cookingProfile)
    }

    func testConflictNeedsExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let loaded = await model.loadCookingPreferences()
        let context = try XCTUnwrap(loaded)
        await server.reject()
        _ = await model.saveCookingPreferences(context, notes: "Draft", slots: [.dinner])
        XCTAssertEqual(model.cookingPending?.state, .conflict)
        await model.retryCookingPreferences()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardCookingConflict()
        XCTAssertNil(model.cookingPending)
    }

    private func fixture() throws -> (SessionModel, CookingTestServer) {
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await chores.respond($0) }
        let server = CookingTestServer(actor: actorA, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "cooking-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return (
            SessionModel(
                auth: auth, chores: ChoreAPI(http: choreHTTP),
                offline: try ChoreOfflineStore(url: url), mealAPI: MealAPI(http: http)), server
        )
    }
}

actor CookingTestServer {
    let actor: UUID
    let household: UUID
    var attempts: [UUID] = []
    private var saved: SaveCookingProfile?
    private var pause = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    func pauseRead() { pause = true }
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
    }
    private var lose = false
    private var rejected = false

    init(actor: UUID, household: UUID) {
        self.actor = actor
        self.household = household
    }
    func loseReply() { lose = true }
    func reject() { rejected = true }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/cooking-preferences/save" {
            let command = try JSONDecoder().decode(SaveCookingProfile.self, from: request.httpBody!)
            attempts.append(command.operationId)
            if rejected { return answer(request, "{\"error\":{\"code\":\"conflict\"}}", status: 409) }
            saved = command
            if lose {
                lose = false
                throw URLError(.networkConnectionLost)
            }
            let receipt = CookingSaveReceipt(
                actorId: actor, householdId: household,
                operationId: command.operationId, revision: "1")
            let json = String(decoding: try JSONEncoder().encode(receipt), as: UTF8.self)
            return answer(request, "{\"version\":1,\"receipt\":\(json)}")
        }
        let profile = saved.map { CookingSlotsEnvelope.Profile(revision: "1", preferences: $0.preferences) }
        if pause {
            pause = false
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resume = $0 }
        }
        let envelope = CookingSlotsEnvelope(version: 1, householdId: household, profile: profile)
        return answer(request, String(decoding: try JSONEncoder().encode(envelope), as: UTF8.self))
    }

    private func answer(_ request: URLRequest, _ body: String, status: Int = 200) -> (Data, URLResponse) {
        (
            Data(body.utf8),
            HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!
        )
    }
}
