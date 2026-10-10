import Foundation
import XCTest

@testable import Nest

@MainActor
final class ProposalModelTests: XCTestCase {
    func testGenerationStagingIsPrivateAndRejectsOldAccount() async throws {
        let a = UUID()
        let b = UUID()
        let household = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: a, accessToken: "token-A"),
            nextSignIn: .init(userId: b, accessToken: "token-B"))
        let server = FakeChoreServer(actorA: a, actorB: b, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "proposal-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let start = try MealWeekStart("2035-06-04")
        let fresh = MealWeekSnapshot(version: 1, householdId: household, weekStart: start, revision: "7", entries: [])
        let weekHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.url?.path, "/v1/meals/week")
            XCTAssertEqual(request.url?.query, "weekStart=2035-06-04")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer token-A")
            return (
                try JSONEncoder().encode(fresh),
                HTTPURLResponse(
                    url: request.url!, statusCode: 200,
                    httpVersion: nil, headerFields: nil)!
            )
        }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url),
            mealAPI: MealAPI(http: weekHTTP))
        await model.restore()
        let context = try await model.cachedProposalContext()
        let week = try await model.freshProposalWeek(start, context: context)
        XCTAssertEqual(week.revision, "7")
        try await model.stageProposalGeneration(week: week, familiarOnly: true, context: context)
        let pending = try await model.cachedProposalContext()
        XCTAssertEqual(pending.saved?.command.familiarOnly, true)
        XCTAssertEqual(pending.saved?.command.expectedWeekRevision, "7")
        await model.signIn(idToken: "B", nonce: "test")
        do {
            _ = try await model.freshProposalWeek(start, context: context)
            XCTFail("Read week through old account context")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let hidden = try await model.cachedProposalContext()
        XCTAssertNil(hidden.saved)
        do {
            try await model.stageProposalGeneration(week: week, familiarOnly: false, context: context)
            XCTFail("Staged old account request")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
    }
}
