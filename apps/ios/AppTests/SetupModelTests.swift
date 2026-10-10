import Foundation
import XCTest

@testable import Nest

@MainActor
final class SetupModelTests: XCTestCase {
    func testQuickAndComprehensiveAreIndependentLocalChoicesWithoutHTTPOrPreferences() async throws {
        let f = try await SetupTestFixture.make(self)
        let entry = FirstUseModel()
        entry.load(session: f.session, member: f.member)
        XCTAssertTrue(entry.presented)
        XCTAssertTrue(entry.choose(.quick, session: f.session))
        let reopened = FirstUseModel()
        reopened.load(session: f.session, member: f.member)
        XCTAssertFalse(reopened.presented)
        let other = VerifiedMember(userId: UUID(), householdId: f.member.householdId, displayName: "Sam")
        f.session.generation += 1
        f.session.status = .ready(other)
        let partner = FirstUseModel()
        partner.load(session: f.session, member: other)
        XCTAssertTrue(partner.presented)
        XCTAssertTrue(partner.choose(.comprehensive, session: f.session))
        XCTAssertFalse(
            entry.choose(.comprehensive, session: f.session),
            "An old screen cannot mutate another session's presentation metadata")
        XCTAssertEqual(f.session.setupChoices?.read(member: f.member), .quick)
        XCTAssertEqual(f.session.setupChoices?.read(member: other), .comprehensive)
        let reads = await f.server.reads
        XCTAssertEqual(reads, 0)
    }

    func testFailedReloadClearsFactsInsteadOfPresentingFalseSetupCompletion() async throws {
        let f = try await SetupTestFixture.make(self)
        let model = SetupModel()
        await model.load(session: f.session, member: f.member)
        XCTAssertEqual(model.status?.foodConfigured, true)
        XCTAssertEqual(model.status?.cookingConfigured, false)
        XCTAssertEqual(model.status?.notificationsConfigured, true)
        await f.server.fail()
        await model.load(session: f.session, member: f.member)
        XCTAssertNil(model.status)
        XCTAssertNotNil(model.notice)
        XCTAssertFalse(model.loading)
        XCTAssertNil(f.session.setupChoices?.read(member: f.member))
        XCTAssertEqual(f.session.status, .ready(f.member), "An unavailable setup read cannot block household use")
    }

    func testDelayedSetupNeverPublishesAfterSignOutPartnerOrSameActorNewGeneration() async throws {
        for change in 0..<3 {
            let f = try await SetupTestFixture.make(self)
            let model = SetupModel()
            let entry = FirstUseModel()
            entry.load(session: f.session, member: f.member)
            await f.server.pause()
            let read = Task { await model.load(session: f.session, member: f.member) }
            await f.server.wait()
            f.session.generation += 1
            if change == 0 { f.session.status = .signedOut }
            if change == 1 {
                f.session.status = .ready(.init(userId: UUID(), householdId: f.member.householdId, displayName: "Sam"))
            }
            await f.server.release()
            await read.value
            XCTAssertNil(model.status)
            XCTAssertFalse(entry.choose(.quick, session: f.session))
            XCTAssertFalse(entry.continueForNow(session: f.session))
            XCTAssertNil(f.session.setupChoices?.read(member: f.member))
        }
    }

    func testLocalChoiceFailureStillAllowsExplicitStartWithoutInventingCompletion() async throws {
        let f = try await SetupTestFixture.make(self, includeChoices: false)
        let entry = FirstUseModel()
        entry.load(session: f.session, member: f.member)
        XCTAssertTrue(entry.presented)
        XCTAssertFalse(entry.choose(.quick, session: f.session))
        XCTAssertNotNil(entry.notice)
        XCTAssertTrue(entry.continueForNow(session: f.session))
        XCTAssertFalse(entry.presented)
        XCTAssertEqual(f.session.status, .ready(f.member))
        let reads = await f.server.reads
        XCTAssertEqual(reads, 0)
    }
}

@MainActor
private struct SetupTestFixture {
    let session: SessionModel
    let member: VerifiedMember
    let server: SetupTestServer

    static func make(_ test: XCTestCase, includeChoices: Bool = true) async throws -> Self {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let server = SetupTestServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "setup-model-\(UUID()).sqlite")
        test.addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let suite = "setup-model-\(UUID())"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        test.addTeardownBlock { defaults.removePersistentDomain(forName: suite) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            setupAPI: SetupAPI(http: http),
            setupChoices: includeChoices
                ? SetupChoiceStore(environment: URL(string: "https://nest-test.example")!, defaults: defaults) : nil)
        await session.restore()
        XCTAssertEqual(session.status, .ready(member))
        return .init(session: session, member: member, server: server)
    }
}

private actor SetupTestServer {
    let member: VerifiedMember
    var reads = 0
    private var failed = false
    private var paused = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    init(member: VerifiedMember) { self.member = member }
    func fail() { failed = true }
    func pause() { paused = true }
    func wait() async { if !waiting { await withCheckedContinuation { started = $0 } } }
    func release() {
        resume?.resume()
        resume = nil
    }
    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET", request.url?.path == "/v1/setup/status", request.httpBody == nil else {
            throw NestAPIFailure.contract
        }
        reads += 1
        if failed { throw URLError(.notConnectedToInternet) }
        if paused {
            paused = false
            waiting = true
            started?.resume()
            started = nil
            await withCheckedContinuation { resume = $0 }
        }
        let status = SetupStatus(
            version: 1, actorId: member.userId, householdId: member.householdId,
            foodConfigured: true, cookingConfigured: false, notificationsConfigured: true)
        return (
            try JSONEncoder().encode(status),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
