import Foundation

@testable import Nest

@MainActor
struct RecipeSnapshotFixture {
    let member = VerifiedMember(
        userId: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        householdId: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, displayName: "Alex")
    let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    let url = FileManager.default.temporaryDirectory.appending(path: "recipe-view-\(UUID()).sqlite")
    let auth: FakeAuthentication
    let chores: FakeChoreServer
    let server: FakeMealServer
    let failures: RecipeSnapshotFailures
    let choreAPI: ChoreAPI
    let mealAPI: MealAPI

    init() throws {
        auth = FakeAuthentication(
            active: AuthenticatedSession(userId: member.userId, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: partner, accessToken: "token-B"))
        chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        server = FakeMealServer(actorA: member.userId, actorB: partner, household: member.householdId)
        failures = RecipeSnapshotFailures()
        let chores = chores
        let server = server
        let failures = failures
        let origin = URL(string: "https://nest.example")!
        choreAPI = ChoreAPI(http: try NestHTTP(baseURL: origin) { try await chores.respond($0) })
        mealAPI = MealAPI(
            http: try NestHTTP(baseURL: origin) {
                if let failure = try await failures.response($0) { return failure }
                return try await server.respond($0)
            })
    }

    func model() throws -> SessionModel {
        SessionModel(auth: auth, chores: choreAPI, offline: try ChoreOfflineStore(url: url), mealAPI: mealAPI)
    }

    func seed(_ model: SessionModel) async throws -> UUID {
        await model.restore()
        await model.refreshMealLibrary()
        guard case .loaded(let listing) = model.mealLibrary, let id = listing.meals.first?.id else {
            throw MealLibraryError.invalidResponse
        }
        await model.loadSavedRecipe(id)
        guard case .loaded = model.savedRecipe else { throw MealLibraryError.invalidResponse }
        return id
    }
}

actor RecipeSnapshotFailures {
    private var offline = false
    private var status: Int?
    private var membershipDenied = false
    private var malformed = false
    private var mutations = 0

    func failOffline() { offline = true }
    func reject(_ status: Int) { self.status = status }
    func rejectMembership() { membershipDenied = true }
    func invalidate() { malformed = true }
    func mutationCount() -> Int { mutations }

    func response(_ request: URLRequest) throws -> (Data, URLResponse)? {
        if request.httpMethod == "POST" { mutations += 1 }
        if membershipDenied, request.url?.path == "/v1/session" {
            return (
                Data("{\"error\":{\"code\":\"not_a_member\"}}".utf8),
                HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            )
        }
        if offline { throw URLError(.notConnectedToInternet) }
        guard request.url?.path == "/v1/meals/library" || request.url?.path == "/v1/meals/recipe" else { return nil }
        guard status != nil || malformed else { return nil }
        let code = status == 401 || status == 403 ? "not_a_member" : "invalid"
        let body = malformed ? "{}" : "{\"error\":{\"code\":\"\(code)\"}}"
        return (
            Data(body.utf8),
            HTTPURLResponse(url: request.url!, statusCode: status ?? 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
