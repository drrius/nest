import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantRoutineModelTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!,
        householdId: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, displayName: "Alex")
    private let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let routine = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var receipt: RoutineCreateReceipt {
        .init(
            actorId: member.userId, householdId: member.householdId, operationId: UUID(), routineId: routine,
            version: "2026-10-01T06:00:00.000002Z", action: "create")
    }

    private func fixture() async throws -> (SessionModel, AssistantRoutineTestServer) {
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let server = AssistantRoutineTestServer(member: member, partner: partner, routine: routine)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url?.path == "/v1/routines" { return try await server.respond(request) }
            return try await base.respond(request)
        }
        let directory = FileManager.default.temporaryDirectory.appending(path: "assistant-routine-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: http),
            offline: try ChoreOfflineStore(url: directory.appending(path: "state.sqlite")))
        await session.restore()
        return (session, server)
    }

    func testFreshReadShowsLaterPauseAndArchiveRatherThanHistoricalCreateState() async throws {
        let (session, server) = try await fixture()
        let detail = AssistantRoutineModel()
        await detail.load(session: session, member: member, receipt: receipt)
        guard case .loaded(let current) = detail.status else { return XCTFail("No current chore") }
        XCTAssertEqual(current?.state, .paused)
        XCTAssertEqual(current?.definition.title, "Current dishes")
        detail.invalidate()
        XCTAssertEqual(detail.status, .loaded(current))
        await server.remove()
        await detail.load(session: session, member: member, receipt: receipt)
        XCTAssertEqual(detail.status, .loaded(nil))
        let count = await server.readCount()
        XCTAssertEqual(count, 2)
    }

    func testOfflineOlderAndForeignReadsCannotDisplayCachedSuccess() async throws {
        let (session, server) = try await fixture()
        let detail = AssistantRoutineModel()
        await detail.load(session: session, member: member, receipt: receipt)
        await server.setOffline()
        await detail.load(session: session, member: member, receipt: receipt)
        XCTAssertEqual(detail.status, .failed)
        await server.setOlder()
        await detail.load(session: session, member: member, receipt: receipt)
        XCTAssertEqual(detail.status, .failed)
        await server.setForeign()
        await detail.load(session: session, member: member, receipt: receipt)
        XCTAssertEqual(detail.status, .failed)
    }

    func testLateResponseCannotReplaceFreshSelectionOrReturnAfterLeaving() async throws {
        let (session, server) = try await fixture()
        let detail = AssistantRoutineModel()
        await server.pauseNext()
        let old = Task { await detail.load(session: session, member: member, receipt: receipt) }
        await server.waitForRequest()
        await server.remove()
        await detail.load(session: session, member: member, receipt: receipt)
        await server.release()
        await old.value
        XCTAssertEqual(detail.status, .loaded(nil))
        await server.pauseNext()
        let leaving = Task { await detail.load(session: session, member: member, receipt: receipt) }
        await server.waitForRequest()
        detail.clear()
        await server.release()
        await leaving.value
        XCTAssertEqual(detail.status, .idle)
    }

    func testLateResponseIsFencedAfterSignOutAndMemberSwitch() async throws {
        for switching in [false, true] {
            let (session, server) = try await fixture()
            let detail = AssistantRoutineModel()
            await server.pauseNext()
            let old = Task { await detail.load(session: session, member: member, receipt: receipt) }
            await server.waitForRequest()
            await session.signOut()
            if switching { await session.signIn(idToken: "B", nonce: "test") }
            await server.release()
            await old.value
            XCTAssertEqual(detail.status, .loading)
            await detail.load(session: session, member: member, receipt: receipt)
            XCTAssertEqual(detail.status, .loading)
            let count = await server.readCount()
            XCTAssertEqual(count, 1)
        }
    }
}

private actor AssistantRoutineTestServer {
    private let member: VerifiedMember
    private let partner: UUID
    private let routine: UUID
    private var offline = false
    private var foreign = false
    private var removed = false
    private var older = false
    private var reads = 0
    private var paused = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resumed: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember, partner: UUID, routine: UUID) {
        self.member = member
        self.partner = partner
        self.routine = routine
    }
    func remove() { removed = true }
    func setOffline() { offline = true }
    func setOlder() {
        offline = false
        older = true
    }
    func setForeign() { foreign = true }
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
        let expectedHousehold = member.householdId.uuidString.lowercased()
        guard request.httpMethod == "GET", request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household")?.lowercased() == expectedHousehold
        else { throw NestAPIFailure.forbidden }
        reads += 1
        if offline { throw URLError(.notConnectedToInternet) }
        let definition: [String: Any] = [
            "title": "Current dishes", "schedule": ["kind": "daily"], "assignment": ["policy": "shared"],
        ]
        let chore: [String: Any] = [
            "routineId": routine.uuidString,
            "version": older ? "2026-10-01T06:00:00.000001Z" : "2026-10-01T06:00:00.000003Z",
            "state": "paused", "definition": definition,
        ]
        let data = try JSONSerialization.data(withJSONObject: [
            "version": 1, "householdId": foreign ? UUID().uuidString : member.householdId.uuidString,
            "members": [
                ["actorId": member.userId.uuidString, "displayName": "Alex"],
                ["actorId": partner.uuidString, "displayName": "Sam"],
            ], "routines": removed ? [] : [chore],
        ])
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
