import Foundation
import XCTest

@testable import NestCore

private actor GroceryRequests {
    private var bodies: [Data] = []
    func record(_ data: Data) { bodies.append(data) }
    func all() -> [Data] { bodies }
}

final class GrocerySyncTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let item = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!
    private let baseURL = URL(string: "https://nest.example/")!

    private func setup() async throws -> (URL, VerifiedMember, UUID, ChoreOfflineStore, OfflineLease) {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-sync-\(UUID()).sqlite")
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let body = """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(item)","name":"Oat milk","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"42","checked":false,"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}]}
            """
        let list = try JSONDecoder().decode(GroceryList.self, from: Data(body.utf8))
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.saveGroceries(list, lease: lease)
        let operation = UUID()
        try await store.enqueueGroceryCheck(list.groceries[0], checked: true, operation: operation, lease: lease)
        return (url, member, operation, store, lease)
    }

    func testLostReplyRetriesExactCapturedOperationAfterRestart() async throws {
        let (url, member, operation, store, lease) = try await setup()
        defer { try? FileManager.default.removeItem(at: url) }
        let requests = GroceryRequests()
        let lost = try NestHTTP(baseURL: baseURL) { request in
            await requests.record(request.httpBody ?? Data())
            throw URLError(.networkConnectionLost)
        }
        do {
            _ = try await GrocerySync(api: GroceryAPI(http: lost), store: store)
                .replay(token: "token", member: member, lease: lease)
            XCTFail("Lost reply cleared the intent")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let body = """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(operation)","target":"\(item)","version":"43","checked":true,"outcome":"already_applied"}}
            """
        let recovered = try NestHTTP(baseURL: baseURL) { request in
            await requests.record(request.httpBody ?? Data())
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (Data(body.utf8), response)
        }
        let conflicted = try await GrocerySync(api: GroceryAPI(http: recovered), store: reopened)
            .replay(token: "token", member: member, lease: current)
        XCTAssertFalse(conflicted)
        let sent = await requests.all()
        XCTAssertEqual(sent.count, 2)
        XCTAssertEqual(sent[0], sent[1])
        let saved = try await reopened.readGroceries(current)
        XCTAssertEqual(saved?.items[0].state, .acknowledged)
        XCTAssertEqual(saved?.items[0].checked, true)
    }

    func testCutoverStopsRetryAndKeepsVisibleConflict() async throws {
        let (url, member, operation, store, lease) = try await setup()
        defer { try? FileManager.default.removeItem(at: url) }
        let denied = try NestHTTP(baseURL: baseURL) { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 409, httpVersion: nil, headerFields: nil)!
            return (Data("{\"error\":{\"code\":\"cutover\"}}".utf8), response)
        }
        let conflicted = try await GrocerySync(api: GroceryAPI(http: denied), store: store)
            .replay(token: "token", member: member, lease: lease)
        XCTAssertTrue(conflicted)
        let pending = try await store.nextGroceryCheck(lease)
        let saved = try await store.readGroceries(lease)
        XCTAssertNil(pending)
        XCTAssertEqual(saved?.items[0].state, .conflict)
        XCTAssertEqual(saved?.items[0].operationId, operation)
    }
}
