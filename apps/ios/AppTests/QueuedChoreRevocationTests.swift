import Foundation
import XCTest

@testable import Nest

@MainActor
final class QueuedChoreRevocationTests: XCTestCase {
    func testRevokedSnapshotWithoutQueuedWritesHidesHousehold() async throws {
        let server = ChoreRefreshTestServer()
        let gate = ChoreRevocationGate(server: server)
        let auth = FakeAuthentication(active: .init(userId: server.a, accessToken: "token-A"))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await gate.respond($0)
        }
        let directory = FileManager.default.temporaryDirectory.appending(path: "revoked-read-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appending(path: "offline.sqlite"))
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let lease = try XCTUnwrap(model.lease)
        guard case .loaded = model.today else { return XCTFail("Initial household missing") }
        let pending = try await store.next(lease)
        XCTAssertNil(pending)
        await gate.revoke()
        await model.refreshToday()
        XCTAssertEqual(model.status, .notMember)
        XCTAssertEqual(model.today, .idle)
        XCTAssertNil(model.lease)
        let cachedMember = try await store.cachedMember(actor: server.a)
        XCTAssertNil(cachedMember, "Denied membership must not be restored from saved chores")
        let attempts = await gate.commands
        XCTAssertTrue(attempts.isEmpty)
    }

    func testForbiddenSnapshotWithCurrentMembershipPreservesSavedChoresWithoutWriting() async throws {
        let server = ChoreRefreshTestServer()
        let gate = ChoreRevocationGate(server: server)
        let auth = FakeAuthentication(active: .init(userId: server.a, accessToken: "token-A"))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await gate.respond($0)
        }
        let directory = FileManager.default.temporaryDirectory.appending(path: "forbidden-read-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appending(path: "offline.sqlite"))
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: store)
        await model.restore()
        let lease = try XCTUnwrap(model.lease)
        let member = model.status
        let saved = model.today
        guard case .loaded = saved else { return XCTFail("Initial household missing") }
        let pending = try await store.next(lease)
        XCTAssertNil(pending)
        await gate.denySnapshot()
        await model.refreshToday()
        XCTAssertEqual(model.status, member)
        XCTAssertEqual(model.today, saved)
        XCTAssertNotNil(model.lease)
        let requests = await gate.deniedRequests
        XCTAssertEqual(requests, ["GET /v1/chores/snapshot", "GET /v1/session"])
        let writes = await server.writes
        XCTAssertTrue(writes.isEmpty)
        let attempts = await gate.commands
        XCTAssertTrue(attempts.isEmpty)
    }

    func testRevocationHidesHouseholdAndPreservesExactQueueAcrossRestart() async throws {
        let server = ChoreRefreshTestServer()
        let gate = ChoreRevocationGate(server: server)
        let auth = FakeAuthentication(active: .init(userId: server.a, accessToken: "token-A"))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await gate.respond($0)
        }
        let api = ChoreAPI(http: http)
        let directory = FileManager.default.temporaryDirectory.appending(path: "revoked-queue-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try FileManager.default.removeItem(at: directory) }
        let url = directory.appending(path: "offline.sqlite")
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(auth: auth, chores: api, offline: store)
        await model.restore()
        let lease = try XCTUnwrap(model.lease)
        guard case .loaded(let state) = model.today else { return XCTFail("Initial household missing") }
        let chore = try XCTUnwrap(state.chores.first?.chore)
        await server.setOffline(true)
        await model.complete(chore)
        let queued = try await store.next(lease)
        let original = try XCTUnwrap(queued)
        await server.setOffline(false)
        await gate.revoke()
        await model.refreshToday()
        XCTAssertEqual(model.status, .notMember)
        XCTAssertEqual(model.today, .idle)
        XCTAssertNil(model.lease)
        let attempted = await gate.commands
        XCTAssertEqual(try attempted.map(encoded), [try encoded(original)])
        let writes = await server.writes
        XCTAssertTrue(writes.isEmpty)
        let reopenedStore = try ChoreOfflineStore(url: url)
        let reopened = SessionModel(auth: auth, chores: api, offline: reopenedStore)
        await reopened.restore()
        XCTAssertEqual(reopened.status, .notMember)
        XCTAssertEqual(reopened.today, .idle)
        XCTAssertNil(reopened.lease)
        let refused = await gate.commands
        XCTAssertEqual(try refused.map(encoded), [try encoded(original)], "A denied restore must not retry the queue")
        let inspection = try await reopenedStore.activate(
            VerifiedMember(userId: server.a, householdId: server.household, displayName: "Test"))
        let retained = try await reopenedStore.next(inspection)
        XCTAssertEqual(
            try encoded(XCTUnwrap(retained)), try encoded(original), "Revocation must not discard uncertain intent")
        try await reopenedStore.deactivate(inspection)
    }
    private func encoded(_ command: CompleteChore) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(command)
    }

}

private actor ChoreRevocationGate {
    let server: ChoreRefreshTestServer
    private var revoked = false
    private var snapshotDenied = false
    private(set) var commands: [CompleteChore] = []
    private(set) var deniedRequests: [String] = []

    init(server: ChoreRefreshTestServer) { self.server = server }
    func revoke() { revoked = true }
    func denySnapshot() { snapshotDenied = true }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if snapshotDenied {
            let path = request.url!.path
            deniedRequests.append("\(request.httpMethod ?? "GET") \(path)")
            if path == "/v1/chores/snapshot" {
                return (
                    Data("{\"error\":{\"code\":\"forbidden\"}}".utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
                )
            }
        }
        if revoked {
            if request.url!.path == "/v1/chores/complete" {
                commands.append(try JSONDecoder().decode(CompleteChore.self, from: XCTUnwrap(request.httpBody)))
            }
            let code = request.url!.path == "/v1/session" ? "not_a_member" : "forbidden"
            return (
                Data("{\"error\":{\"code\":\"\(code)\"}}".utf8),
                HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
            )
        }
        return try await server.respond(request)
    }
}
