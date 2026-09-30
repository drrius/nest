import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreRefreshRecoveryTests: XCTestCase {
    func testCancelledPresentingTaskDoesNotLoseAcceptedQueuedCompletion() async throws {
        let f = try await ChoreRefreshFixture.make()
        defer { try? FileManager.default.removeItem(at: f.directory) }
        let chore = try XCTUnwrap(try f.chores().first)
        await f.server.pauseSnapshot(f.server.a)
        let refresh = Task { await f.model.refreshToday() }
        await f.server.waitForSnapshot(f.server.a)
        await f.model.complete(chore)
        refresh.cancel()
        await f.server.releaseSnapshot(f.server.a)
        await refresh.value
        let writes = await f.server.writes
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.command.occurrenceId, chore.id)
        let lease = try XCTUnwrap(f.model.lease)
        let pending = try await f.store.next(lease)
        XCTAssertNil(pending)
    }

    func testCompletionsDuringSnapshotReadDrainWithoutAnotherUserAction() async throws {
        let f = try await ChoreRefreshFixture.make()
        defer { try? FileManager.default.removeItem(at: f.directory) }
        let chores = try f.chores()
        XCTAssertEqual(chores.count, 2)
        await f.server.pauseSnapshot(f.server.a)
        let refresh = Task { await f.model.refreshToday() }
        await f.server.waitForSnapshot(f.server.a)
        for chore in chores { await f.model.complete(chore) }
        for _ in 0..<40 { await f.model.refreshToday() }
        let lease = try XCTUnwrap(f.model.lease)
        let next = try await f.store.next(lease)
        let queued = try XCTUnwrap(next)
        await f.server.releaseSnapshot(f.server.a)
        await refresh.value
        let writes = await f.server.writes
        XCTAssertEqual(writes.count, 2)
        XCTAssertEqual(writes.first?.command.operationId, queued.operationId)
        XCTAssertEqual(Set(writes.map { $0.command.occurrenceId }), Set(chores.map(\.id)))
        XCTAssertTrue(writes.allSatisfy { $0.actor == f.server.a })
        let reads = await f.server.snapshotCount(f.server.a)
        XCTAssertEqual(reads, 3, "Restore, original refresh and one coalesced follow-up")
        let pending = try await f.store.next(lease)
        XCTAssertNil(pending)
        XCTAssertTrue(try f.chores().isEmpty)
        XCTAssertNil(f.model.todayNotice)
    }

    func testFailedFollowupRetainsExactRequestUntilOnlineRetry() async throws {
        let f = try await ChoreRefreshFixture.make()
        defer { try? FileManager.default.removeItem(at: f.directory) }
        let chore = try XCTUnwrap(try f.chores().first)
        await f.server.pauseSnapshot(f.server.a)
        let refresh = Task { await f.model.refreshToday() }
        await f.server.waitForSnapshot(f.server.a)
        await f.model.complete(chore)
        let lease = try XCTUnwrap(f.model.lease)
        let next = try await f.store.next(lease)
        let queued = try XCTUnwrap(next)
        await f.server.setOffline(true)
        await f.server.releaseSnapshot(f.server.a)
        await refresh.value
        let saved = try await f.store.next(lease)
        XCTAssertEqual(saved?.operationId, queued.operationId)
        XCTAssertNotNil(f.model.todayNotice)
        let failedWrites = await f.server.writes
        XCTAssertTrue(failedWrites.isEmpty)
        await f.server.setOffline(false)
        await f.model.refreshToday()
        let writes = await f.server.writes
        XCTAssertEqual(writes.count, 1)
        let delivered = try JSONSerialization.jsonObject(with: JSONEncoder().encode(writes[0].command)) as? NSDictionary
        let original = try JSONSerialization.jsonObject(with: JSONEncoder().encode(queued)) as? NSDictionary
        XCTAssertEqual(delivered, original)
        let pending = try await f.store.next(lease)
        XCTAssertNil(pending)
    }

    func testOldRefreshCannotConsumeNewAccountsFollowupOrSendItsSavedRequest() async throws {
        let f = try await ChoreRefreshFixture.make()
        defer { try? FileManager.default.removeItem(at: f.directory) }
        let chore = try XCTUnwrap(try f.chores().first)
        await f.server.pauseSnapshot(f.server.a)
        let old = Task { await f.model.refreshToday() }
        await f.server.waitForSnapshot(f.server.a)
        await f.model.complete(chore)
        let oldLease = try XCTUnwrap(f.model.lease)
        let next = try await f.store.next(oldLease)
        let queued = try XCTUnwrap(next)
        await f.server.pauseSnapshot(f.server.b)
        let new = Task { await f.model.signIn(idToken: "B", nonce: "test") }
        await f.server.waitForSnapshot(f.server.b)
        await f.model.refreshToday()
        await f.server.releaseSnapshot(f.server.a)
        await old.value
        await f.server.releaseSnapshot(f.server.b)
        await new.value
        let reads = await f.server.snapshotCount(f.server.b)
        XCTAssertEqual(reads, 2)
        XCTAssertEqual(try f.chores().map(\.id), [f.server.b])
        let before = await f.server.writes
        XCTAssertTrue(before.isEmpty, "Account B cannot deliver account A's saved request")
        await f.model.signIn(idToken: "A", nonce: "test")
        let writes = await f.server.writes
        XCTAssertEqual(writes.count, 1)
        XCTAssertEqual(writes.first?.actor, f.server.a)
        XCTAssertEqual(writes.first?.command.operationId, queued.operationId)
    }
}
