import Foundation
import XCTest

@testable import Nest

@MainActor
final class RoutineStateModelTests: XCTestCase {
    func testLostReplyAndConflictKeepExactRevision() async throws {
        for conflict in [false, true] { try await checkRecovery(conflict: conflict) }
    }

    private func checkRecovery(conflict: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let server = RoutineStateServer(member: member, conflict: conflict)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/routines/state" { return try await server.respond(request) }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-state-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let context = try model.routineCreateContext()
        let command = RoutineStateCommand(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z", action: .pause)
        try await store.enqueueRoutineState(command, title: "Tidy", lease: context.lease)
        if !conflict {
            do {
                _ = try await model.retryRoutineState(context)
                XCTFail("Lost reply reported success")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        }
        let result = try await model.retryRoutineState(context)
        XCTAssertEqual(result.command, command)
        XCTAssertEqual(result.conflicted, conflict)
        XCTAssertEqual(result.receipt != nil, !conflict)
        let replay = try await model.retryRoutineState(context)
        XCTAssertEqual(replay, result)
        let requests = await server.commands
        XCTAssertEqual(requests, conflict ? [command] : [command, command])
        try await model.finishRoutineState(context, operation: command.operationId)
        let remaining = try await model.savedRoutineState(context)
        XCTAssertNil(remaining)
        await model.signOut()
        do {
            _ = try await model.retryRoutineState(context)
            XCTFail("Signed-out state retry permitted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor RoutineStateServer {
    let member: VerifiedMember
    let conflict: Bool
    var commands: [RoutineStateCommand] = []
    init(member: VerifiedMember, conflict: Bool) {
        self.member = member
        self.conflict = conflict
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(RoutineStateCommand.self, from: request.httpBody!)
        commands.append(command)
        guard command == commands.first else { throw NestAPIFailure.contract }
        if !conflict && commands.count == 1 { throw URLError(.networkConnectionLost) }
        let body: [String: Any] =
            conflict
            ? ["error": ["code": "conflict"]]
            : [
                "version": 1,
                "receipt": [
                    "actorId": member.userId.uuidString, "householdId": member.householdId.uuidString,
                    "operationId": command.operationId.uuidString, "routineId": command.routineId.uuidString,
                    "version": "2026-09-28T09:00:01.123456Z", "action": command.action.rawValue,
                ],
            ]
        return (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: conflict ? 409 : 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
