import Foundation
import XCTest

@testable import Nest

@MainActor
final class OfflineResumeTests: XCTestCase {
    func testReconnectionDuringUncertainPrivacyWriteRetainsItsFollowup() async throws {
        let f = try await CalendarPrivacyModelFixture.make()
        defer { try? FileManager.default.removeItem(at: f.url) }
        f.model.offlineReplayReady = true
        await f.server.loseNextReply()
        await f.server.pauseNextWrite()
        let first = Task { await f.model.refreshCalendarPrivacy(access: .denied) }
        await f.server.waitForWrite()
        await f.model.resumeOfflineWork(calendarAccess: .allowed)
        await f.server.release()
        await first.value
        for _ in 0..<500 where f.model.calendarPrivacyPending {
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertFalse(f.model.calendarPrivacyPending)
        let writes = await f.server.writes
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes.first, writes.last, "A lost off reply keeps the exact removal request")
        XCTAssertTrue(writes.allSatisfy { !$0.enabled })
    }

    func testReconnectionRemovesRetainedSharingEvenWhenPermissionWasRestored() async throws {
        let f = try await CalendarPrivacyModelFixture.make()
        defer { try? FileManager.default.removeItem(at: f.url) }
        await f.server.setOfflineRead(true)
        await f.model.refreshCalendarPrivacy(access: .denied)
        XCTAssertTrue(f.model.calendarPrivacyPending)
        await f.server.setOfflineRead(false)
        f.model.offlineReplayReady = true
        await f.model.resumeOfflineWork(calendarAccess: .allowed)
        let writes = await f.server.writes
        XCTAssertEqual(writes.map(\.enabled), [false])
        XCTAssertFalse(f.model.calendarPrivacyPending)
        let context = try await f.model.calendarConsentContext()
        XCTAssertNil(context.removal)
    }

    func testReconnectionReplaysOnlyAllowedChecksWithOriginalIdentities() async throws {
        let f = try await OfflineResumeFixture.make()
        defer { try? FileManager.default.removeItem(at: f.base.directory) }
        let lease = try XCTUnwrap(f.model.lease)
        let chore = try XCTUnwrap(try f.chores().first)
        let grocery = try f.grocery()
        await f.base.server.setOffline(true)
        await f.groceries.setOffline(true)
        await f.model.complete(chore)
        await f.model.checkGrocery(grocery, checked: true)
        let choreNext = try await f.base.store.next(lease)
        let groceryNext = try await f.base.store.nextGroceryCheck(lease)
        let choreCommand = try XCTUnwrap(choreNext)
        let groceryCommand = try XCTUnwrap(groceryNext)
        let add = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Explicit retry only", quantity: nil, unit: nil, categoryId: nil)
        try await f.base.store.enqueueGroceryAdd(add, lease: lease)
        let beforeChores = await f.base.server.requests
        let beforeGroceries = await f.log.requests
        await f.model.resumeOfflineWork(calendarAccess: .allowed)
        let inactiveChores = await f.base.server.requests
        let inactiveGroceries = await f.log.requests
        XCTAssertEqual(inactiveChores, beforeChores)
        XCTAssertEqual(inactiveGroceries.count, beforeGroceries.count)
        f.model.offlineReplayReady = true
        // A satisfied path does not guarantee API reachability.
        await f.model.resumeOfflineWork(calendarAccess: .allowed)
        let failedChore = try await f.base.store.next(lease)
        let failedGrocery = try await f.base.store.nextGroceryCheck(lease)
        XCTAssertEqual(failedChore?.operationId, choreCommand.operationId)
        XCTAssertEqual(failedGrocery, groceryCommand)
        await f.base.server.setOffline(false)
        await f.groceries.setOffline(false)
        await f.model.resumeOfflineWork(calendarAccess: .allowed)
        let writes = await f.base.server.writes
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.command.operationId, choreCommand.operationId)
        let pendingChore = try await f.base.store.next(lease)
        let pendingGrocery = try await f.base.store.nextGroceryCheck(lease)
        XCTAssertNil(pendingChore)
        XCTAssertNil(pendingGrocery)
        XCTAssertEqual(try f.grocery().checked, true)
        let pendingAdd = try await f.base.store.readGroceryAdd(lease)
        XCTAssertEqual(pendingAdd?.command, add, "Online-only writes keep their explicit recovery")
        let requests = await f.log.requests
        XCTAssertFalse(requests.contains { $0.path == "/v1/groceries/add" })
        let checks = try requests.filter { $0.path == "/v1/groceries/check" }.map {
            try JSONDecoder().decode(CheckGrocery.self, from: XCTUnwrap($0.body))
        }
        XCTAssertTrue(checks.allSatisfy { $0 == groceryCommand })
    }

    func testInactiveTransitionPreventsStartingTheNextGroceryStage() async throws {
        let f = try await OfflineResumeFixture.make()
        defer { try? FileManager.default.removeItem(at: f.base.directory) }
        f.model.offlineReplayReady = true
        await f.base.server.pauseSnapshot(f.base.server.a)
        let before = await f.log.requests.count
        let resume = Task { await f.model.resumeOfflineWork(calendarAccess: .allowed) }
        await f.base.server.waitForSnapshot(f.base.server.a)
        f.model.offlineReplayReady = false
        await f.base.server.releaseSnapshot(f.base.server.a)
        await resume.value
        let after = await f.log.requests.count
        XCTAssertEqual(after, before)
    }

    func testMemberSwitchDoesNotStartTheOldResumesGroceryStage() async throws {
        let f = try await OfflineResumeFixture.make()
        defer { try? FileManager.default.removeItem(at: f.base.directory) }
        f.model.offlineReplayReady = true
        await f.base.server.pauseSnapshot(f.base.server.a)
        let before = await f.log.requests.count
        let resume = Task { await f.model.resumeOfflineWork(calendarAccess: .allowed) }
        await f.base.server.waitForSnapshot(f.base.server.a)
        await f.model.signIn(idToken: "B", nonce: "test")
        await f.base.server.releaseSnapshot(f.base.server.a)
        await resume.value
        let after = await f.log.requests.count
        XCTAssertEqual(after, before)
        XCTAssertEqual(try f.chores().map(\.id), [f.base.server.b])
        XCTAssertEqual(f.model.groceries, .idle)
    }
}

actor OfflineGroceryRequests {
    struct Request: Sendable {
        let path: String
        let body: Data?
    }
    private(set) var requests: [Request] = []
    func record(_ request: URLRequest) { requests.append(.init(path: request.url!.path, body: request.httpBody)) }
}

@MainActor
struct OfflineResumeFixture {
    let base: ChoreRefreshFixture
    let groceries: FakeGroceryServer
    let log: OfflineGroceryRequests
    let model: SessionModel

    static func make() async throws -> Self {
        let base = try await ChoreRefreshFixture.make()
        let groceries = FakeGroceryServer(
            actorA: base.server.a, actorB: base.server.b, household: base.server.household)
        let log = OfflineGroceryRequests()
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            await log.record($0)
            return try await groceries.respond($0)
        }
        let model = SessionModel(
            auth: base.auth, chores: base.api, offline: base.store, groceryAPI: GroceryAPI(http: http))
        await model.restore()
        await model.refreshGroceries()
        return Self(base: base, groceries: groceries, log: log, model: model)
    }

    func chores() throws -> [NestChore] {
        guard case .loaded(let value) = model.today else { throw OfflineFailure.missingSnapshot }
        return value.chores.map(\.chore)
    }

    func grocery() throws -> GroceryItem {
        guard case .loaded(let value) = model.groceries, let item = value.items.first else {
            throw OfflineFailure.missingSnapshot
        }
        return item.item
    }
}
