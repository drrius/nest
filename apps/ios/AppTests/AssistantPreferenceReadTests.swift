import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantPreferenceReadTests: XCTestCase {
    func testExistingDestinationsReadFreshValuesWithoutReplayingHistoricalSaves() async throws {
        let (session, server, member) = try fixture()
        await session.restore()
        let cached = try await session.cachedFoodContext()
        let food = try await session.refreshFoodContext(cached)
        XCTAssertEqual(food.profile?.profile?.revision, "7")
        XCTAssertEqual(food.profile?.profile?.preferences.dislikes, ["Current dislikes"])
        let cooking = await session.loadCookingPreferences()
        XCTAssertEqual(cooking?.profile.profile?.revision, "8")
        XCTAssertEqual(cooking?.profile.profile?.preferences.cookingNotes, "Current household notes")
        let notifications = NotificationPreferencesModel()
        await notifications.load(session: session, member: member)
        XCTAssertEqual(notifications.baseline?.profile?.revision, "9")
        XCTAssertFalse(notifications.preferences.dailySummaryEnabled)
        let memory = PrivateMemoryModel()
        await memory.load(session: session, member: member)
        XCTAssertTrue(memory.loaded)
        XCTAssertEqual(memory.memories.first?.content, "Current private memory")
        let writes = await server.writes
        XCTAssertEqual(writes, 0)
    }

    func testFailedFreshReadsDoNotReportCachedSuccess() async throws {
        let (session, server, member) = try fixture()
        await session.restore()
        let cached = try await session.cachedFoodContext()
        let food = try await session.refreshFoodContext(cached)
        _ = await session.loadCookingPreferences()
        let notifications = NotificationPreferencesModel()
        await notifications.load(session: session, member: member)
        let memory = PrivateMemoryModel()
        await memory.load(session: session, member: member)
        await server.goOffline()
        do {
            _ = try await session.refreshFoodContext(food)
            XCTFail("A saved profile is not a fresh read")
        } catch {}
        let cooking = await session.loadCookingPreferences()
        XCTAssertNil(cooking)
        await notifications.load(session: session, member: member)
        XCTAssertNil(notifications.baseline)
        XCTAssertNotNil(notifications.notice)
        await memory.load(session: session, member: member)
        XCTAssertFalse(memory.loaded)
        XCTAssertTrue(memory.memories.isEmpty)
        XCTAssertNotNil(memory.notice)
        let writes = await server.writes
        XCTAssertEqual(writes, 0)
    }

    private func fixture() throws -> (SessionModel, PreferenceDestinationServer, VerifiedMember) {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await chores.respond($0) }
        let server = PreferenceDestinationServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "preference-result-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: http), foodAPI: FoodAPI(http: http), assistantAPI: AssistantAPI(http: http),
            notificationAPI: NotificationAPI(http: http))
        return (session, server, member)
    }
}

private actor PreferenceDestinationServer {
    let member: VerifiedMember
    var writes = 0
    private var offline = false

    init(member: VerifiedMember) { self.member = member }
    func goOffline() { offline = true }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET" else {
            writes += 1
            throw URLError(.badServerResponse)
        }
        guard !offline else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "X-Nest-Household") == member.householdId.uuidString.lowercased()
        else { throw URLError(.userAuthenticationRequired) }
        let data = try responseData(request.url?.path)
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: nil)!)
    }

    private func responseData(_ path: String?) throws -> Data {
        switch path {
        case "/v1/food-preferences":
            return try JSONEncoder().encode(
                FoodProfileEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    profile: .init(
                        revision: "7",
                        preferences: .init(
                            restrictions: [], dislikes: ["Current dislikes"], calorieGoal: nil, portions: 1))))
        case "/v1/cooking-preferences":
            return try JSONEncoder().encode(
                CookingSlotsEnvelope(
                    version: 1, householdId: member.householdId,
                    profile: .init(
                        revision: "8",
                        preferences: .init(cookingNotes: "Current household notes", mealSlots: [.dinner]))))
        case "/v1/notification-preferences":
            return try JSONEncoder().encode(
                NotificationProfileEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId, timeZone: "Europe/Zurich",
                    profile: .init(
                        revision: "9",
                        preferences: .init(
                            dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: false))))
        case "/v1/memories":
            return try JSONEncoder().encode(
                PrivateMemories(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    memories: [.init(id: UUID(), revision: "4", content: "Current private memory")]))
        default: throw URLError(.badURL)
        }
    }
}
