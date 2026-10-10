import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreChangeStagingTests: XCTestCase {
    func testChangedDateAssignmentAndMissingOccurrenceCannotStage() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let current = NestChore(
            occurrenceId: UUID(), title: "Tidy", dueDate: try CivilDate("2026-09-28"), assigneeId: nil,
            offlineEpoch: nil)
        let snapshot = ChoreSnapshot(
            version: 1, householdId: member.householdId,
            members: [NestMember(actorId: member.userId, displayName: "Test")], transfers: [], chores: [current])
        let body = try JSONEncoder().encode(snapshot)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/chores/snapshot" {
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "change-stage-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url))
        await model.restore()
        let context = try model.routineCreateContext()
        let variants = [
            NestChore(
                occurrenceId: current.id, title: "Tidy", dueDate: try CivilDate("2026-09-27"),
                assigneeId: nil, offlineEpoch: nil),
            NestChore(
                occurrenceId: current.id, title: "Tidy", dueDate: current.dueDate,
                assigneeId: member.userId, offlineEpoch: nil),
            NestChore(
                occurrenceId: UUID(), title: "Tidy", dueDate: current.dueDate,
                assigneeId: nil, offlineEpoch: nil),
        ]
        for stale in variants {
            do {
                try await model.stageChoreChange(stale, newDueDate: nil, context: context)
                XCTFail("Stale occurrence staged")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        }
        let absent = try await model.savedChoreChange(context)
        XCTAssertNil(absent)
        try await model.stageChoreChange(current, newDueDate: nil, context: context)
        let saved = try await model.savedChoreChange(context)
        XCTAssertEqual(saved?.command.occurrenceId, current.id)
        XCTAssertEqual(saved?.command.expectedDueDate, current.dueDate)
        XCTAssertEqual(saved?.command.action, "skip")
    }
}
