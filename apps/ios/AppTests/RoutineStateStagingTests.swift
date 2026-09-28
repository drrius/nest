import Foundation
import XCTest

@testable import Nest

@MainActor
final class RoutineStateStagingTests: XCTestCase {
    func testChangedRevisionAndIncompatibleActionCannotStage() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let current = HouseholdRoutine(
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z",
            definition: .init(title: "Tidy", schedule: .daily, assignment: .shared), state: .active)
        let body = try JSONSerialization.data(withJSONObject: [
            "version": 1, "householdId": member.householdId.uuidString,
            "members": [["actorId": member.userId.uuidString, "displayName": "Test"]],
            "routines": [try JSONSerialization.jsonObject(with: JSONEncoder().encode(current))],
        ])
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/routines" {
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-stage-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url))
        await model.restore()
        let context = try model.routineCreateContext()
        let stale = HouseholdRoutine(
            routineId: current.id, version: "2026-09-28T09:00:00.123455Z",
            definition: current.definition, state: .active)
        do {
            try await model.stageRoutineState(.pause, routine: stale, context: context)
            XCTFail("Stale microsecond revision staged")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        do {
            try await model.stageRoutineState(.resume, routine: current, context: context)
            XCTFail("Active routine resumed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let absent = try await model.savedRoutineState(context)
        XCTAssertNil(absent)
        try await model.stageRoutineState(.pause, routine: current, context: context)
        let saved = try await model.savedRoutineState(context)
        XCTAssertEqual(saved?.command.expectedVersion, current.version)
        XCTAssertEqual(saved?.command.routineId, current.id)
        XCTAssertEqual(saved?.command.action, .pause)
    }
}
