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
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url))
        await model.restore()
        let context = try await model.cachedProposalContext()
        let week = MealWeekSnapshot(
            version: 1, householdId: household, weekStart: try MealWeekStart("2035-06-04"),
            revision: "0", entries: [])
        try await model.stageProposalGeneration(week: week, familiarOnly: true, context: context)
        let pending = try await model.cachedProposalContext()
        XCTAssertEqual(pending.saved?.command.familiarOnly, true)
        await model.signIn(idToken: "B", nonce: "test")
        let hidden = try await model.cachedProposalContext()
        XCTAssertNil(hidden.saved)
        do {
            try await model.stageProposalGeneration(week: week, familiarOnly: false, context: context)
            XCTFail("Staged old account request")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
    }
}
