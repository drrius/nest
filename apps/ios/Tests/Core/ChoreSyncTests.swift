import Foundation
import XCTest

@testable import NestCore

private actor RequestBodies {
    private var values: [Data] = []
    func record(_ body: Data) { values.append(body) }
    func all() -> [Data] { values }
}

final class ChoreSyncTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let occurrence = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private let epoch = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!
    private let baseURL = URL(string: "https://nest.example/")!

    private func setup() async throws -> (URL, VerifiedMember, NestChore, UUID, ChoreOfflineStore, OfflineLease) {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: "offline.sqlite")
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let chore = NestChore(
            occurrenceId: occurrence, title: "Recycle",
            dueDate: try CivilDate("2026-09-28"), assigneeId: actor,
            offlineEpoch: epoch)
        let snapshot = ChoreSnapshot(
            version: 1, householdId: household,
            members: [NestMember(actorId: actor, displayName: "Alex")],
            transfers: [], chores: [chore])
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.save(snapshot, lease: lease)
        let operation = UUID()
        try await store.enqueue(chore, on: chore.dueDate, operation: operation, lease: lease)
        return (url, member, chore, operation, store, lease)
    }

    func testLostReplyReplaysIdenticalAuthorizedCommandAfterRestart() async throws {
        let (url, member, chore, operation, store, lease) = try await setup()
        let bodies = RequestBodies()
        let lost = try NestHTTP(baseURL: baseURL) { request in
            await bodies.record(request.httpBody ?? Data())
            throw URLError(.networkConnectionLost)
        }
        do {
            _ = try await ChoreSync(api: ChoreAPI(http: lost), store: store)
                .replay(token: "test-token", member: member, lease: lease)
            XCTFail("Lost reply was treated as acknowledged")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let body = """
            {"version":1,"householdId":"\(household.uuidString)","receipt":{"version":1,"operationId":"\(operation.uuidString)","occurrenceId":"\(occurrence.uuidString)","completedBy":"\(actor.uuidString)","completedOn":"2026-09-28","outcome":"already_completed"}}
            """
        let recovered = try NestHTTP(baseURL: baseURL) { request in
            await bodies.record(request.httpBody ?? Data())
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 200,
                httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
        let conflicted = try await ChoreSync(api: ChoreAPI(http: recovered), store: reopened)
            .replay(token: "test-token", member: member, lease: current)
        XCTAssertFalse(conflicted)
        let sent = await bodies.all()
        XCTAssertEqual(sent.count, 2)
        XCTAssertEqual(sent[0], sent[1])
        let payload = try XCTUnwrap(JSONSerialization.jsonObject(with: sent[1]) as? [String: String])
        XCTAssertEqual(payload["operationId"], operation.uuidString)
        XCTAssertEqual(payload["offlineEpoch"], epoch.uuidString)
        let state = try await reopened.read(current)
        XCTAssertEqual(state?.chores[0].state, .completed)
        XCTAssertEqual(state?.chores[0].chore.id, chore.id)
    }

    func testCutoverBecomesVisibleConflictAndStopsAutomaticRetry() async throws {
        let (_, member, _, _, store, lease) = try await setup()
        let http = try NestHTTP(baseURL: baseURL) { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 409,
                httpVersion: nil, headerFields: nil)!
            return (Data("{\"error\":{\"code\":\"cutover\"}}".utf8), response)
        }
        let conflicted = try await ChoreSync(api: ChoreAPI(http: http), store: store)
            .replay(token: "test-token", member: member, lease: lease)
        XCTAssertTrue(conflicted)
        let pending = try await store.next(lease)
        let state = try await store.read(lease)
        XCTAssertNil(pending)
        XCTAssertEqual(state?.chores[0].state, .conflict)
    }

    func testForbiddenRetainsUncertainOperation() async throws {
        let (_, member, _, operation, store, lease) = try await setup()
        let http = try NestHTTP(baseURL: baseURL) { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 403,
                httpVersion: nil, headerFields: nil)!
            return (Data("{\"error\":{\"code\":\"forbidden\"}}".utf8), response)
        }
        do {
            _ = try await ChoreSync(api: ChoreAPI(http: http), store: store)
                .replay(token: "test-token", member: member, lease: lease)
            XCTFail("Forbidden write silently cleared queued intent")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        let pending = try await store.next(lease)
        XCTAssertEqual(pending?.operationId, operation)
    }

    func testForbiddenAfterFreshMemberReadBecomesVisibleConflict() async throws {
        let (_, member, chore, operation, store, lease) = try await setup()
        let snapshot = ChoreSnapshot(
            version: 1, householdId: member.householdId,
            members: [NestMember(actorId: member.userId, displayName: member.displayName)],
            transfers: [], chores: [chore])
        let snapshotBody = try JSONEncoder().encode(snapshot)
        let sessionBody = Data(
            "{\"version\":1,\"member\":{\"userId\":\"\(member.userId.uuidString)\",\"householdId\":\"\(member.householdId.uuidString)\",\"displayName\":\"Alex renamed\"}}"
                .utf8
        )
        let http = try NestHTTP(baseURL: baseURL) { request in
            let path = request.url!.path
            let status = path == "/v1/chores/complete" ? 403 : 200
            let body = path == "/v1/session" ? sessionBody : snapshotBody
            let response = HTTPURLResponse(
                url: request.url!, statusCode: status,
                httpVersion: nil, headerFields: nil)!
            return (body, response)
        }
        let (fresh, conflicted) = try await ChoreSync(api: ChoreAPI(http: http), store: store)
            .replayAndRead(token: "test-token", member: member, lease: lease)
        try await store.save(fresh, lease: lease)
        let pending = try await store.next(lease)
        let state = try await store.read(lease)
        XCTAssertTrue(conflicted)
        XCTAssertNil(pending)
        XCTAssertEqual(state?.chores[0].state, .conflict)
        XCTAssertEqual(state?.chores[0].operationId, operation)
    }

    func testForbiddenWithoutFreshAuthorizationRetainsPendingIntent() async throws {
        let (_, member, _, operation, store, lease) = try await setup()
        let http = try NestHTTP(baseURL: baseURL) { request in
            let response = HTTPURLResponse(
                url: request.url!, statusCode: 403,
                httpVersion: nil, headerFields: nil)!
            return (Data("{\"error\":{\"code\":\"forbidden\"}}".utf8), response)
        }
        do {
            _ = try await ChoreSync(api: ChoreAPI(http: http), store: store)
                .replayAndRead(token: "test-token", member: member, lease: lease)
            XCTFail("Denied membership cleared queued intent")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        let pending = try await store.next(lease)
        XCTAssertEqual(pending?.operationId, operation)
    }
}
