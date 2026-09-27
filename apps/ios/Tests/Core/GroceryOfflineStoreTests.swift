import Foundation
import XCTest

@testable import NestCore

final class GroceryOfflineStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let itemID = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testQueuedCheckSurvivesReopenButNotTenantSwitch() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        let list = try sampleList(version: "42", checked: false)
        try await first.saveGroceries(list, lease: lease)
        try await first.enqueueGroceryCheck(list.groceries[0], checked: true, operation: UUID(), lease: lease)
        let saved = try await first.readGroceries(lease)
        XCTAssertEqual(saved?.items[0].state, .pending)
        XCTAssertEqual(saved?.items[0].checked, true)

        let reopened = try ChoreOfflineStore(url: url)
        let other = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let otherLease = try await reopened.activate(other)
        let otherItems = try await reopened.readGroceries(otherLease)
        XCTAssertNil(otherItems)
        do {
            _ = try await first.readGroceries(lease)
            XCTFail("Old tenant lease remained active")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let current = try await reopened.activate(member)
        let pending = try await reopened.nextGroceryCheck(current)
        let restored = try await reopened.readGroceries(current)
        XCTAssertNotNil(pending)
        XCTAssertEqual(restored?.items[0].state, .pending)
    }

    func testAcknowledgedCheckStaysVisibleUntilNewSnapshotObservesIt() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let stale = try sampleList(version: "42", checked: false)
        try await store.saveGroceries(stale, lease: lease)
        let operation = UUID()
        try await store.enqueueGroceryCheck(stale.groceries[0], checked: true, operation: operation, lease: lease)
        let receipt = try checkReceipt(operation: operation, version: "43")
        try await store.acknowledgeGroceryCheck(receipt, lease: lease)
        try await store.saveGroceries(stale, lease: lease)
        let retained = try await store.readGroceries(lease)
        XCTAssertEqual(retained?.items[0].state, .acknowledged)
        XCTAssertEqual(retained?.items[0].checked, true)

        try await store.saveGroceries(try sampleList(version: "43", checked: true), lease: lease)
        let observed = try await store.readGroceries(lease)
        XCTAssertEqual(observed?.items[0].state, .open)
        XCTAssertEqual(observed?.items[0].checked, true)
    }

    func testConflictRetainsIntentUntilExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try sampleList(version: "42", checked: false)
        try await store.saveGroceries(list, lease: lease)
        let operation = UUID()
        try await store.enqueueGroceryCheck(list.groceries[0], checked: true, operation: operation, lease: lease)
        try await store.conflictGroceryCheck(operation, reason: "changed", lease: lease)
        try await store.saveGroceries(try sampleList(version: "43", checked: false), lease: lease)
        let conflicted = try await store.readGroceries(lease)
        XCTAssertEqual(conflicted?.items[0].state, .conflict)
        XCTAssertEqual(conflicted?.items[0].checked, false)
        try await store.discardGroceryCheck(operation, lease: lease)
        let discarded = try await store.readGroceries(lease)
        XCTAssertEqual(discarded?.items[0].state, .open)
    }

    private func sampleList(version: String, checked: Bool) throws -> GroceryList {
        let data = Data(
            """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(itemID)","name":"Oat milk","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"\(version)","checked":\(checked),"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}]}
            """.utf8)
        return try JSONDecoder().decode(GroceryList.self, from: data)
    }

    private func checkReceipt(operation: UUID, version: String) throws -> GroceryCheckReceipt {
        let data = Data(
            """
            {"operation":"\(operation)","target":"\(itemID)","version":"\(version)","checked":true,"outcome":"applied"}
            """.utf8)
        return try JSONDecoder().decode(GroceryCheckReceipt.self, from: data)
    }
}
