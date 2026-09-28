import Foundation
import XCTest

@testable import Nest

@MainActor
final class RoutineCancellationModelTests: XCTestCase {
    func testLostCancellationReplyKeepsIntentAndNeverCreatesOnRetry() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let server = RoutineCancelServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path.hasPrefix("/v1/routines/") { return try await server.respond(request) }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-cancel-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let context = try model.routineCreateContext()
        let command = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        try await store.enqueueRoutineCreation(command, lease: context.lease)
        do {
            _ = try await model.cancelRoutineCreation(context)
            XCTFail("Lost reply was reported as confirmed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let uncertain = try await model.savedRoutineCreation(context)
        XCTAssertEqual(uncertain?.cancellationRequested, true)
        XCTAssertNil(uncertain?.cancellation)
        let result = try await model.retryRoutineCreation(context)
        XCTAssertEqual(result.cancellation?.status, .cancelled)
        XCTAssertEqual(result.command, command)
        let replay = try await model.retryRoutineCreation(context)
        XCTAssertEqual(replay, result)
        let paths = await server.paths
        XCTAssertEqual(paths, ["/v1/routines/cancel-create", "/v1/routines/cancel-create"])
        try await model.finishRoutineCreation(context, operation: command.operationId)
        let remaining = try await model.savedRoutineCreation(context)
        XCTAssertNil(remaining)
        await model.signOut()
        do {
            _ = try await model.cancelRoutineCreation(context)
            XCTFail("Signed-out cancellation permitted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor RoutineCancelServer {
    let member: VerifiedMember
    var paths: [String] = []
    var original: CreateRoutine?
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        paths.append(request.url!.path)
        guard request.url!.path == "/v1/routines/cancel-create" else { throw NestAPIFailure.contract }
        let command = try JSONDecoder().decode(CreateRoutine.self, from: request.httpBody!)
        if original == nil { original = command }
        guard command == original else { throw NestAPIFailure.contract }
        if paths.count == 1 { throw URLError(.networkConnectionLost) }
        let result = RoutineCancellation(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
