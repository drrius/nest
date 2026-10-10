import Foundation
import XCTest

@testable import Nest

actor ChoreRefreshTestServer {
    let a = UUID()
    let b = UUID()
    let household = UUID()
    let epoch = UUID()
    private var completed: Set<UUID> = []
    private var snapshots: [UUID: Int] = [:]
    private var paused: Set<UUID> = []
    private var arrived: Set<UUID> = []
    private var start: [UUID: CheckedContinuation<Void, Never>] = [:]
    private var resume: [UUID: CheckedContinuation<Void, Never>] = [:]
    private var offline = false
    private(set) var writes: [(actor: UUID, command: CompleteChore)] = []
    private(set) var requests = 0

    func setOffline(_ value: Bool) { offline = value }
    func snapshotCount(_ actor: UUID) -> Int { snapshots[actor, default: 0] }
    func pauseSnapshot(_ actor: UUID) { paused.insert(actor) }

    func waitForSnapshot(_ actor: UUID) async {
        if arrived.contains(actor) { return }
        await withCheckedContinuation { start[actor] = $0 }
    }

    func releaseSnapshot(_ actor: UUID) {
        resume.removeValue(forKey: actor)?.resume()
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        requests += 1
        try Task.checkCancellation()
        if offline { throw URLError(.notConnectedToInternet) }
        let token = request.value(forHTTPHeaderField: "Authorization")
        let actor = token == "Bearer token-A" ? a : b
        XCTAssertTrue(token == "Bearer token-A" || token == "Bearer token-B")
        switch request.url?.path {
        case "/v1/session":
            let body: [String: Any] = [
                "version": 1,
                "member": ["userId": actor.uuidString, "householdId": household.uuidString, "displayName": "Test"],
            ]
            return try answer(request, body: body)
        case "/v1/chores/snapshot":
            XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), household.uuidString.lowercased())
            let data = try JSONEncoder().encode(snapshot(actor))
            snapshots[actor, default: 0] += 1
            if paused.remove(actor) != nil {
                arrived.insert(actor)
                start.removeValue(forKey: actor)?.resume()
                await withCheckedContinuation { resume[actor] = $0 }
            }
            try Task.checkCancellation()
            return (data, response(request))
        case "/v1/chores/complete": return try complete(request, actor: actor)
        default: throw NestAPIFailure.contract
        }
    }

    private func snapshot(_ actor: UUID) throws -> ChoreSnapshot {
        let ids = actor == a ? [a, epoch] : [b]
        let chores = try ids.filter { !completed.contains($0) }.map {
            NestChore(
                occurrenceId: $0, title: "Fictional \($0)", dueDate: try CivilDate("2026-09-28"),
                assigneeId: actor, offlineEpoch: epoch)
        }
        return ChoreSnapshot(
            version: 1, householdId: household,
            members: [.init(actorId: a, displayName: "Test"), .init(actorId: b, displayName: "Test")],
            transfers: [], chores: chores)
    }

    private func complete(_ request: URLRequest, actor: UUID) throws -> (Data, URLResponse) {
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Nest-Household"), household.uuidString.lowercased())
        let command = try JSONDecoder().decode(CompleteChore.self, from: XCTUnwrap(request.httpBody))
        XCTAssertTrue(actor == a ? [a, epoch].contains(command.occurrenceId) : command.occurrenceId == b)
        XCTAssertEqual(command.offlineEpoch, epoch)
        writes.append((actor, command))
        completed.insert(command.occurrenceId)
        return try answer(
            request,
            body: [
                "version": 1, "householdId": household.uuidString,
                "receipt": [
                    "version": 1, "operationId": command.operationId.uuidString,
                    "occurrenceId": command.occurrenceId.uuidString, "completedBy": actor.uuidString,
                    "completedOn": command.completedOn.value, "outcome": "completed",
                ],
            ])
    }

    private func response(_ request: URLRequest) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
    }

    private func answer(_ request: URLRequest, body: [String: Any]) throws -> (Data, URLResponse) {
        (try JSONSerialization.data(withJSONObject: body), response(request))
    }
}

@MainActor
struct ChoreRefreshFixture {
    let server: ChoreRefreshTestServer
    let auth: FakeAuthentication
    let api: ChoreAPI
    let store: ChoreOfflineStore
    let directory: URL
    let model: SessionModel

    static func make() async throws -> Self {
        let server = ChoreRefreshTestServer()
        let auth = FakeAuthentication(
            active: .init(userId: server.a, accessToken: "token-A"),
            nextSignIn: .init(userId: server.b, accessToken: "token-B"))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await server.respond($0)
        }
        let api = ChoreAPI(http: http)
        let directory = FileManager.default.temporaryDirectory.appending(path: "chore-refresh-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = try ChoreOfflineStore(url: directory.appending(path: "offline.sqlite"))
        let model = SessionModel(auth: auth, chores: api, offline: store)
        await model.restore()
        return Self(server: server, auth: auth, api: api, store: store, directory: directory, model: model)
    }

    func chores() throws -> [NestChore] {
        guard case .loaded(let state) = model.today else { throw OfflineFailure.missingSnapshot }
        return state.chores.map(\.chore)
    }
}
