import Foundation
import XCTest

@testable import NestCore

final class ChoreOfflineStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let partner = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!

    private func fixture() -> (VerifiedMember, ChoreSnapshot) {
        let member = VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
        let chore = NestChore(
            occurrenceId: UUID(), title: "Take out recycling",
            dueDate: try! CivilDate("2026-09-28"), assigneeId: actor,
            offlineEpoch: epoch)
        let snapshot = ChoreSnapshot(
            version: 1, householdId: household,
            members: [NestMember(actorId: actor, displayName: "Alex")],
            transfers: [], chores: [chore])
        return (member, snapshot)
    }

    private func database() throws -> URL {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appending(path: "offline.sqlite")
    }

    func testUncertainCompletionSurvivesRestartWithSameOperationAndEpoch() async throws {
        let url = try database()
        let (member, snapshot) = fixture()
        let operation = UUID()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.save(snapshot, lease: lease)
        try await store.enqueue(
            snapshot.chores[0], on: snapshot.chores[0].dueDate,
            operation: operation, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let newLease = try await reopened.activate(member)
        let pendingValue = try await reopened.next(newLease)
        let pending = try XCTUnwrap(pendingValue)
        XCTAssertEqual(pending.operationId, operation)
        XCTAssertEqual(pending.offlineEpoch, epoch)
        let beforeAck = try await reopened.read(newLease)
        XCTAssertEqual(beforeAck?.chores[0].state, .pending)
        let receipt = ChoreCompletion(
            version: 1, operationId: operation,
            occurrenceId: snapshot.chores[0].id, completedBy: actor,
            completedOn: snapshot.chores[0].dueDate, outcome: .completed)
        try await reopened.acknowledge(receipt, lease: newLease)
        let next = try await reopened.next(newLease)
        let afterAck = try await reopened.read(newLease)
        XCTAssertNil(next)
        XCTAssertEqual(afterAck?.chores[0].state, .completed)
        try await reopened.save(snapshot, lease: newLease)
        let stillVisible = try await reopened.read(newLease)
        XCTAssertEqual(stillVisible?.chores[0].state, .completed)
        let cleared = ChoreSnapshot(
            version: 1, householdId: household,
            members: snapshot.members, transfers: [], chores: [])
        try await reopened.save(cleared, lease: newLease)
        let empty = try await reopened.read(newLease)
        XCTAssertTrue(empty?.chores.isEmpty == true)
    }

    func testAccountSwitchInvalidatesOldLeaseAndHidesOtherSnapshot() async throws {
        let store = try ChoreOfflineStore(url: database())
        let (member, snapshot) = fixture()
        let old = try await store.activate(member)
        try await store.save(snapshot, lease: old)
        let other = VerifiedMember(userId: partner, householdId: UUID(), displayName: "Sam")
        let current = try await store.activate(other)
        do {
            _ = try await store.read(old)
            XCTFail("Stale lease was accepted")
        } catch OfflineFailure.sessionChanged {}
        let otherState = try await store.read(current)
        XCTAssertNil(otherState)
    }

    func testConflictRequiresExplicitDiscardBeforeRetry() async throws {
        let store = try ChoreOfflineStore(url: database())
        let (member, snapshot) = fixture()
        let lease = try await store.activate(member)
        try await store.save(snapshot, lease: lease)
        let chore = snapshot.chores[0]
        let operation = UUID()
        try await store.enqueue(chore, on: chore.dueDate, operation: operation, lease: lease)
        try await store.conflict(operation, reason: "cutover", lease: lease)
        let changed = ChoreSnapshot(
            version: 1, householdId: household,
            members: snapshot.members, transfers: [], chores: [])
        try await store.save(changed, lease: lease)
        let blocked = try await store.next(lease)
        let conflicted = try await store.read(lease)
        XCTAssertNil(blocked)
        XCTAssertEqual(conflicted?.chores[0].state, .conflict)
        XCTAssertEqual(conflicted?.chores[0].chore.id, chore.id)
        do {
            try await store.enqueue(chore, on: chore.dueDate, operation: UUID(), lease: lease)
            XCTFail("Conflicting intent was overwritten")
        } catch OfflineFailure.alreadyQueued {}
        try await store.discard(operation, lease: lease)
        do {
            try await store.enqueue(chore, on: chore.dueDate, operation: UUID(), lease: lease)
            XCTFail("Removed chore accepted after conflict discard")
        } catch OfflineFailure.missingSnapshot {}
    }

    func testChangedSnapshotCannotBeQueuedAsOldIntent() async throws {
        let store = try ChoreOfflineStore(url: database())
        let (member, snapshot) = fixture()
        let lease = try await store.activate(member)
        try await store.save(snapshot, lease: lease)
        let changed = NestChore(
            occurrenceId: snapshot.chores[0].id, title: "Changed",
            dueDate: snapshot.chores[0].dueDate, assigneeId: actor,
            offlineEpoch: epoch)
        do {
            try await store.enqueue(changed, on: changed.dueDate, operation: UUID(), lease: lease)
            XCTFail("Changed snapshot was accepted")
        } catch OfflineFailure.missingSnapshot {}
    }
}
