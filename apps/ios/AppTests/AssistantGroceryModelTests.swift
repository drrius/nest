import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantGroceryModelTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        householdId: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, displayName: "Alex")
    private let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!

    private func session(server: AssistantGroceryTestServer) throws -> SessionModel {
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let directory = FileManager.default.temporaryDirectory.appending(path: "assistant-grocery-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP),
            offline: try ChoreOfflineStore(url: directory.appending(path: "state.sqlite")),
            groceryAPI: GroceryAPI(http: http))
    }

    private var result: AssistantGroceryActionLink {
        .init(itemId: member.userId, version: "43", action: .added)
    }

    func testFreshReadShowsCurrentStateAndLaterRemovalWithoutWrites() async throws {
        let server = AssistantGroceryTestServer(household: member.householdId, item: member.userId)
        let session = try session(server: server)
        await session.restore()
        let detail = AssistantGroceryModel()
        await detail.load(session: session, member: member, result: result)
        guard case .loaded(let first) = detail.status else { return XCTFail("Current grocery missing") }
        XCTAssertEqual(first?.name, "Current apples")
        XCTAssertEqual(first?.checked, true)
        await server.setRemoved()
        await detail.load(session: session, member: member, result: result)
        XCTAssertEqual(detail.status, .loaded(nil))
        let writes = await server.writeCount()
        XCTAssertEqual(writes, 0)
    }

    func testOfflineOlderAndForeignListsCannotConfirmHistoricalReceipt() async throws {
        let server = AssistantGroceryTestServer(household: member.householdId, item: member.userId)
        let session = try session(server: server)
        await session.restore()
        let detail = AssistantGroceryModel()
        await detail.load(session: session, member: member, result: result)
        await server.setOffline()
        await detail.load(session: session, member: member, result: result)
        XCTAssertEqual(detail.status, .failed)
        await server.setVersion("42")
        await detail.load(session: session, member: member, result: result)
        XCTAssertEqual(detail.status, .failed)
        await server.setForeign()
        await detail.load(session: session, member: member, result: result)
        XCTAssertEqual(detail.status, .failed)
    }

    func testLateResponseCannotReplaceNewSelectionOrReturnAfterLeaving() async throws {
        let server = AssistantGroceryTestServer(household: member.householdId, item: member.userId)
        let session = try session(server: server)
        await session.restore()
        let detail = AssistantGroceryModel()
        await server.pauseNext()
        let old = Task { await detail.load(session: session, member: member, result: result) }
        await server.waitForRequest()
        await server.setRemoved()
        await detail.load(session: session, member: member, result: result)
        XCTAssertEqual(detail.status, .loaded(nil))
        await server.release()
        await old.value
        XCTAssertEqual(detail.status, .loaded(nil))
        await server.pauseNext()
        let leaving = Task { await detail.load(session: session, member: member, result: result) }
        await server.waitForRequest()
        detail.clear()
        await server.release()
        await leaving.value
        XCTAssertEqual(detail.status, .idle)
    }

    func testLateResponseIsFencedAfterSignOutAndMemberSwitch() async throws {
        for switching in [false, true] {
            let server = AssistantGroceryTestServer(household: member.householdId, item: member.userId)
            let session = try session(server: server)
            await session.restore()
            let context = try session.assistantContext()
            await server.pauseNext()
            let old = Task { try await session.readAssistantGrocery(result, context: context) }
            await server.waitForRequest()
            await session.signOut()
            if switching { await session.signIn(idToken: "B", nonce: "test") }
            await server.release()
            do {
                _ = try await old.value
                XCTFail("Returned old-account grocery")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
            let detail = AssistantGroceryModel()
            await detail.load(session: session, member: member, result: result)
            XCTAssertEqual(detail.status, .loading)
            let reads = await server.readCount()
            XCTAssertEqual(reads, 1)
        }
    }
}

private actor AssistantGroceryTestServer {
    let household: UUID
    let item: UUID
    private var offline = false
    private var foreign = false
    private var removed = false
    private var version = "44"
    private var writes = 0
    private var reads = 0
    private var paused = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resumed: CheckedContinuation<Void, Never>?

    init(household: UUID, item: UUID) {
        self.household = household
        self.item = item
    }
    func setRemoved() { removed = true }
    func setOffline() { offline = true }
    func setVersion(_ value: String) {
        version = value
        offline = false
    }
    func setForeign() { foreign = true }
    func writeCount() -> Int { writes }
    func readCount() -> Int { reads }
    func pauseNext() {
        paused = true
        waiting = false
    }
    func waitForRequest() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func release() {
        resumed?.resume()
        resumed = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET" else {
            writes += 1
            throw NestAPIFailure.invalid
        }
        guard request.url?.path == "/v1/groceries",
            request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household")?.lowercased() == household.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        reads += 1
        if offline { throw URLError(.notConnectedToInternet) }
        let grocery = GroceryItem(
            itemId: item, name: "Current apples", quantity: "2", unit: "pieces", categoryId: nil,
            categoryName: nil, version: version, checked: true, legacyClaimed: false,
            offlineEpoch: nil, mealSource: nil)
        let data = try JSONEncoder().encode(
            GroceryList(version: 1, householdId: foreign ? UUID() : household, groceries: removed ? [] : [grocery]))
        if paused {
            paused = false
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resumed = $0 }
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
