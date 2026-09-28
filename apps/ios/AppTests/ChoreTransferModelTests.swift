import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreTransferModelTests: XCTestCase {
    func testLostReplyPreservesRecipientDecision() async throws {
        for conflict in [false, true] {
            for action: RespondChoreTransfer.Action in [.accept, .decline] {
                try await checkRecovery(conflict: conflict, action: action)
            }
        }
    }

    private func checkRecovery(conflict: Bool, action: RespondChoreTransfer.Action) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let server = ChoreTransferServer(member: member, conflict: conflict)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/chores/transfers/respond" {
                return try await server.respond(request)
            }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "chore-change-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let context = try model.routineCreateContext()
        let pending = PendingChoreTransfer(
            requestId: UUID(), occurrenceId: UUID(), dueDate: try CivilDate("2026-09-28"),
            fromMemberId: partner, toMemberId: member.userId, title: "Tidy")
        await server.setPending(pending)
        let command = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: action)
        let savedCommand = SavedTransferCommand.respond(command, pending)
        try await store.enqueueChoreTransfer(savedCommand, title: "Tidy", lease: context.lease)
        if !conflict {
            do {
                _ = try await model.retryChoreTransfer(context)
                XCTFail("Lost reply reported success")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        }
        let result = try await model.retryChoreTransfer(context)
        XCTAssertEqual(result.command, savedCommand)
        XCTAssertEqual(result.conflicted, conflict)
        XCTAssertEqual(result.receipt != nil, !conflict)
        let replay = try await model.retryChoreTransfer(context)
        XCTAssertEqual(replay, result)
        let requests = await server.commands
        XCTAssertEqual(requests, conflict ? [command] : [command, command])
        try await model.finishChoreTransfer(context, operation: command.operationId)
        let remaining = try await model.savedChoreTransfer(context)
        XCTAssertNil(remaining)
        await model.signOut()
        do {
            _ = try await model.retryChoreTransfer(context)
            XCTFail("Signed-out state retry permitted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor ChoreTransferServer {
    let member: VerifiedMember
    let conflict: Bool
    var commands: [RespondChoreTransfer] = []
    var pending: PendingChoreTransfer?
    func setPending(_ value: PendingChoreTransfer) { pending = value }
    init(member: VerifiedMember, conflict: Bool) {
        self.member = member
        self.conflict = conflict
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(RespondChoreTransfer.self, from: request.httpBody!)
        guard let pending else { throw NestAPIFailure.contract }
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
                    "operationId": command.operationId.uuidString, "requestId": command.requestId.uuidString,
                    "occurrenceId": pending.occurrenceId.uuidString, "dueDate": pending.dueDate.value,
                    "fromMemberId": pending.fromMemberId.uuidString, "toMemberId": member.userId.uuidString,
                    "action": command.action.rawValue, "state": command.action == .accept ? "accepted" : "declined",
                ],
            ]
        return (
            try JSONSerialization.data(withJSONObject: body),
            HTTPURLResponse(url: request.url!, statusCode: conflict ? 409 : 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
