import Foundation
import XCTest

@testable import Nest

@MainActor
final class RoutineCreationModelTests: XCTestCase {
    func testLostReplyReplaysExactCommandAndConfirmedRetryDoesNotSubmit() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let server = RoutineCreationServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path.hasPrefix("/v1/routines/") { return try await server.respond(request) }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "routine-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url))
        await model.restore()
        let context = try model.routineCreateContext()
        let invalid = try CreateRoutine(
            operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .assigned(UUID()))
        do {
            try await model.stageRoutineCreation(invalid, context: context)
            XCTFail("Unknown household member accepted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
        let input = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        try await model.stageRoutineCreation(input, context: context)
        do {
            _ = try await model.retryRoutineCreation(context)
            XCTFail("Lost response reported success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let uncertain = try await model.savedRoutineCreation(context)
        XCTAssertEqual(uncertain?.command, input)
        XCTAssertNil(uncertain?.receipt)
        let recovered = try await model.retryRoutineCreation(context)
        XCTAssertNotNil(recovered.receipt)
        let repeated = try await model.retryRoutineCreation(context)
        XCTAssertEqual(repeated, recovered)
        let requests = await server.requests
        XCTAssertEqual(requests, [input, input])
        await model.signOut()
        do {
            _ = try await model.retryRoutineCreation(context)
            XCTFail("Signed-out request sent")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor RoutineCreationServer {
    let member: VerifiedMember
    let routine = UUID()
    var requests: [CreateRoutine] = []
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let document: [String: Any]
        if request.url!.path.hasSuffix("/roster") {
            document = [
                "version": 1, "householdId": member.householdId.uuidString,
                "members": [["actorId": member.userId.uuidString, "displayName": "Test"]],
            ]
        } else {
            let command = try JSONDecoder().decode(CreateRoutine.self, from: request.httpBody!)
            requests.append(command)
            if requests.count == 1 { throw URLError(.networkConnectionLost) }
            guard requests.first == command else { throw NestAPIFailure.contract }
            document = [
                "version": 1,
                "receipt": [
                    "actorId": member.userId.uuidString, "householdId": member.householdId.uuidString,
                    "operationId": command.operationId.uuidString, "routineId": routine.uuidString,
                    "version": "2026-09-28T09:00:00.123456Z", "action": "create",
                ],
            ]
        }
        return (
            try JSONSerialization.data(withJSONObject: document),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
