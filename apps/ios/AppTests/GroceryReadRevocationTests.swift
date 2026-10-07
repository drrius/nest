import Foundation
import XCTest

@testable import Nest

@MainActor
final class GroceryReadRevocationTests: XCTestCase {
    func testForbiddenListWithoutQueuedWritesReverifiesAndHidesRevokedHousehold() async throws {
        let (model, gate, store) = try fixture()
        await model.restore()
        await model.refreshGroceries()
        let lease = try XCTUnwrap(model.lease)
        guard case .loaded = model.groceries else { return XCTFail("Initial groceries missing") }
        let pending = try await store.nextGroceryCheck(lease)
        XCTAssertNil(pending)
        await gate.denyList(revokeMembership: true)
        await model.refreshGroceries()
        XCTAssertEqual(model.status, .notMember)
        XCTAssertEqual(model.groceries, .idle)
        XCTAssertNil(model.lease)
        let cachedMember = try await store.cachedMember(actor: lease.actor)
        XCTAssertNil(cachedMember, "Denied membership must not be restored from saved chores")
        let requests = await gate.deniedRequests
        XCTAssertEqual(requests, ["GET /v1/groceries", "GET /v1/session"])
    }

    func testForbiddenListWithCurrentMembershipPreservesSavedGroceriesWithoutWriting() async throws {
        let (model, gate, _) = try fixture()
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let saved) = model.groceries else { return XCTFail("Initial groceries missing") }
        let member = model.status
        await gate.denyList(revokeMembership: false)
        await model.refreshGroceries()
        XCTAssertEqual(model.status, member)
        guard case .loaded(let retained) = model.groceries else { return XCTFail("Saved groceries lost") }
        XCTAssertEqual(retained, saved)
        XCTAssertNotNil(model.lease)
        let requests = await gate.deniedRequests
        XCTAssertEqual(requests, ["GET /v1/groceries", "GET /v1/session"])
    }

    private func fixture() throws -> (SessionModel, GroceryReadRevocationGate, ChoreOfflineStore) {
        let actor = UUID()
        let partner = UUID()
        let household = UUID()
        let server = FakeGroceryServer(actorA: actor, actorB: partner, household: household)
        let gate = GroceryReadRevocationGate(server: server)
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let auth = FakeAuthentication(active: .init(userId: actor, accessToken: "token-A"))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await gate.respond($0)
        }
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) {
            try await chores.respond($0)
        }
        let directory = FileManager.default.temporaryDirectory.appending(path: "grocery-revocation-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appending(path: "offline.sqlite"))
        return (
            SessionModel(
                auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
                groceryAPI: GroceryAPI(http: http)), gate, store
        )
    }
}

private actor GroceryReadRevocationGate {
    let server: FakeGroceryServer
    private var listDenied = false
    private var membershipRevoked = false
    private(set) var deniedRequests: [String] = []

    init(server: FakeGroceryServer) { self.server = server }

    func denyList(revokeMembership: Bool) {
        listDenied = true
        membershipRevoked = revokeMembership
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url!.path
        if listDenied {
            deniedRequests.append("\(request.httpMethod ?? "GET") \(path)")
            if path == "/v1/groceries" || (path == "/v1/session" && membershipRevoked) {
                let code = path == "/v1/session" ? "not_a_member" : "forbidden"
                return (
                    Data("{\"error\":{\"code\":\"\(code)\"}}".utf8),
                    HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!
                )
            }
        }
        return try await server.respond(request)
    }
}
