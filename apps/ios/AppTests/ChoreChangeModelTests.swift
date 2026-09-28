import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreChangeModelTests: XCTestCase {
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
        let server = ChoreChangeServer(member: member, conflict: conflict)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/chores/reschedule" { return try await server.respond(request) }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "chore-change-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let context = try model.routineCreateContext()
        let command = ChoreChangeCommand(
            operationId: UUID(), occurrenceId: UUID(), expectedDueDate: try CivilDate("2026-09-28"),
            newDueDate: try CivilDate("2026-10-01"))
        try await store.enqueueChoreChange(command, title: "Tidy", lease: context.lease)
        if !conflict {
            do {
                _ = try await model.retryChoreChange(context)
                XCTFail("Lost reply reported success")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        }
        let result = try await model.retryChoreChange(context)
        XCTAssertEqual(result.command, command)
        XCTAssertEqual(result.conflicted, conflict)
        XCTAssertEqual(result.receipt != nil, !conflict)
        let replay = try await model.retryChoreChange(context)
        XCTAssertEqual(replay, result)
        let requests = await server.commands
        XCTAssertEqual(requests, conflict ? [command] : [command, command])
        try await model.finishChoreChange(context, operation: command.operationId)
        let remaining = try await model.savedChoreChange(context)
        XCTAssertNil(remaining)
        await model.signOut()
        do {
            _ = try await model.retryChoreChange(context)
            XCTFail("Signed-out state retry permitted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor ChoreChangeServer {
    let member: VerifiedMember
    let conflict: Bool
    var commands: [ChoreChangeCommand] = []
    init(member: VerifiedMember, conflict: Bool) {
        self.member = member
        self.conflict = conflict
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(ChoreChangeCommand.self, from: request.httpBody!)
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
                    "operationId": command.operationId.uuidString, "occurrenceId": command.occurrenceId.uuidString,
                    "previousDueDate": command.expectedDueDate.value, "dueDate": command.newDueDate!.value,
                    "action": "reschedule", "status": "open",
                ],
            ]
        return (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: conflict ? 409 : 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
