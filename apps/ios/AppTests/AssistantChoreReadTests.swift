import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantChoreReadTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    private func fixture() async throws -> (SessionModel, AssistantChoreReader) {
        let auth = FakeAuthentication(
            active: .init(userId: actor, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let reader = AssistantChoreReader(
            member: .init(userId: actor, householdId: household, displayName: "Alex"), partner: partner)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url?.path == "/v1/chores/snapshot" { return try await reader.respond(request) }
            return try await base.respond(request)
        }
        let directory = FileManager.default.temporaryDirectory.appending(path: "assistant-chore-read-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: directory) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: http),
            offline: try ChoreOfflineStore(url: directory.appending(path: "state.sqlite")))
        await session.restore()
        return (session, reader)
    }

    func testResultDestinationsReadCurrentSnapshotWithoutDispatchingCommands() async throws {
        let (session, reader) = try await fixture()
        let before = await reader.readCount()
        let context = try session.routineCreateContext()
        let current = try await session.readChangeableChores(context)
        XCTAssertEqual(current.householdId, household)
        XCTAssertEqual(current.members.first?.actorId, actor)
        let after = await reader.readCount()
        XCTAssertEqual(after, before + 1)
    }

    func testDestinationReadsRejectLateRepliesAfterSignOutAndMemberSwitch() async throws {
        for switching in [false, true] {
            let (session, reader) = try await fixture()
            let context = try session.routineCreateContext()
            await reader.pauseNext()
            let request = Task { try await session.readChangeableChores(context) }
            await reader.waitForRequest()
            await session.signOut()
            if switching {
                await session.signIn(idToken: "B", nonce: "test")
                XCTAssertEqual(session.status, .ready(.init(userId: partner, householdId: household, displayName: "Sam")))
            }
            await reader.release()
            do {
                _ = try await request.value
                XCTFail("Returned an old-account snapshot")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        }
    }
}

private actor AssistantChoreReader {
    private let member: VerifiedMember
    private let partner: UUID
    private var reads = 0
    private var paused = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resumed: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember, partner: UUID) {
        self.member = member
        self.partner = partner
    }
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
        let household = member.householdId.uuidString.lowercased()
        let token = request.value(forHTTPHeaderField: "Authorization") ?? ""
        guard request.httpMethod == "GET", ["Bearer token-A", "Bearer token-B"].contains(token),
            request.value(forHTTPHeaderField: "x-nest-household")?.lowercased() == household
        else { throw NestAPIFailure.forbidden }
        reads += 1
        let snapshot = ChoreSnapshot(
            version: 1, householdId: member.householdId,
            members: [
                .init(actorId: member.userId, displayName: member.displayName),
                .init(actorId: partner, displayName: "Sam"),
            ], transfers: [], chores: [])
        let data = try JSONEncoder().encode(snapshot)
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
