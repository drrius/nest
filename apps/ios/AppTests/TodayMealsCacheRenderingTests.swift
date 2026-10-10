import SwiftUI
import XCTest

@testable import Nest

@MainActor
final class TodayMealsCacheRenderingTests: XCTestCase {
    func testSavedMealRemainsVisibleDuringUnavailableRefresh() async throws {
        #if targetEnvironment(simulator)
            guard ProcessInfo.processInfo.environment["NEST_QA_TODAY_CACHE_RENDER"] == "20261007" else {
                throw XCTSkip("Requires the owned Today cache rendering probe")
            }
        #else
            throw XCTSkip("Controlled rendering fixtures are forbidden on phones")
        #endif
        let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
        let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
        let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
        let server = FakeMealServer(actorA: actor, actorB: partner, household: household)
        let model = try makeModel(server: server, actor: actor, partner: partner, household: household)
        await model.restore()
        guard case .ready(let member) = model.status else { return XCTFail("Not ready") }
        let start = try MealWeekStart("2026-09-28")
        let day = try CivilDate("2026-09-29")
        await model.selectMealWeek(start)
        let placed = await model.placeMeal(date: day, slot: .dinner, title: "Saved pasta")
        XCTAssertTrue(placed)
        let cached = try await model.cachedTodayMeals(start, member: member, generation: model.generation)
        XCTAssertEqual(cached?.week.entries.map(\.title), ["Saved pasta"])
        await server.pauseActorA()
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let original = scene.windows.first(where: \.isKeyWindow)
        let window = UIWindow(windowScene: scene)
        let refresh = UUID()
        let controller = UIHostingController(
            rootView: NavigationStack {
                TodayMealsSection(model: model, member: member, day: day, refresh: refresh)
                    .padding(20).frame(maxHeight: .infinity, alignment: .top)
                    .background(QuietPalette.background)
            })
        window.rootViewController = controller
        window.makeKeyAndVisible()
        defer {
            window.isHidden = true
            original?.makeKeyAndVisible()
            Task { await server.releaseActorA() }
        }
        await server.waitForActorA()
        try await Task.sleep(for: .milliseconds(150))
        capture(window, name: "Saved Today meals while actual read waits")
        await server.failWeeks(.unavailable)
        await server.releaseActorA()
        try await Task.sleep(for: .milliseconds(250))
        capture(window, name: "Saved Today meals after unavailable reply")
    }

    private func makeModel(server: FakeMealServer, actor: UUID, partner: UUID, household: UUID) throws -> SessionModel {
        let auth = FakeAuthentication(active: AuthenticatedSession(userId: actor, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await chores.respond(request)
        }
        let mealHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await server.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "today-render-\(UUID()).sqlite")
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: mealHTTP))
    }

    private func capture(_ window: UIWindow, name: String) {
        window.layoutIfNeeded()
        XCTAssertFalse(window.isHidden)
        XCTAssertGreaterThan(window.bounds.width, 0)
        let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
            XCTAssertTrue(window.drawHierarchy(in: window.bounds, afterScreenUpdates: true))
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
