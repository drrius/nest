import Foundation
import XCTest

@testable import NestCore

final class GroceryRemoveStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let target = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testUncertainRemoveRetainsExactOperationAcrossRestartAndAccountSwitch() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", includeItem: true)
        try await store.saveGroceries(list, lease: lease)
        let item = try XCTUnwrap(list.groceries.first)
        let command = RemoveGrocery(item: item, operationId: UUID())
        try await store.enqueueGroceryRemove(item, command: command, lease: lease)

        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let foreign = try await reopened.readGroceryRemove(outsiderLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readGroceryRemove(lease)
            XCTFail("Old lease accessed another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readGroceryRemove(restored)
        XCTAssertEqual(saved?.state, .pending)
        XCTAssertEqual(saved?.command, command)
        XCTAssertEqual(saved?.command.expectedVersion, "42")
    }

    func testRejectedRemoveSurvivesRefreshUntilExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", includeItem: true)
        try await store.saveGroceries(list, lease: lease)
        let item = try XCTUnwrap(list.groceries.first)
        let command = RemoveGrocery(item: item, operationId: UUID())
        try await store.enqueueGroceryRemove(item, command: command, lease: lease)
        try await store.conflictGroceryRemove(command.operationId, reason: "changed", lease: lease)
        try await store.saveGroceries(try snapshot(version: "43", includeItem: true), lease: lease)
        let conflicted = try await store.readGroceryRemove(lease)
        XCTAssertEqual(conflicted?.state, .conflict)
        try await store.discardConflictedGroceryRemove(command.operationId, lease: lease)
        let discarded = try await store.readGroceryRemove(lease)
        XCTAssertNil(discarded)
    }

    func testAcknowledgedRemoveWaitsUntilFreshListOmitsTarget() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", includeItem: true)
        try await store.saveGroceries(list, lease: lease)
        let item = try XCTUnwrap(list.groceries.first)
        let command = RemoveGrocery(item: item, operationId: UUID())
        try await store.enqueueGroceryRemove(item, command: command, lease: lease)
        let body = """
            {"operation":"\(command.operationId)","target":"\(target)","version":"43","checked":false,"removed":true}
            """
        let receipt = try JSONDecoder().decode(GroceryWriteReceipt.self, from: Data(body.utf8))
        try await store.acknowledgeGroceryRemove(receipt, lease: lease)
        try await store.saveGroceries(list, lease: lease)
        let acknowledged = try await store.readGroceryRemove(lease)
        XCTAssertEqual(acknowledged?.state, .acknowledged)
        try await store.saveGroceries(try snapshot(version: "43", includeItem: false), lease: lease)
        let cleared = try await store.readGroceryRemove(lease)
        XCTAssertNil(cleared)
    }

    func testPendingRemoveBlocksAnotherMutationOfSameItem() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-remove-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", includeItem: true)
        try await store.saveGroceries(list, lease: lease)
        let item = try XCTUnwrap(list.groceries.first)
        try await store.enqueueGroceryRemove(
            item, command: RemoveGrocery(item: item, operationId: UUID()), lease: lease)
        let edit = try EditGrocery(
            item: item, operationId: UUID(), name: "Almond milk",
            quantity: nil, unit: nil, categoryId: nil)
        do {
            try await store.enqueueGroceryEdit(item, command: edit, lease: lease)
            XCTFail("Edit was queued while removal was unresolved")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        do {
            try await store.enqueueGroceryCheck(item, checked: true, operation: UUID(), lease: lease)
            XCTFail("Check was queued while removal was unresolved")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
    }

    private func snapshot(version: String, includeItem: Bool) throws -> GroceryList {
        let row = """
            {"itemId":"\(target)","name":"Oat milk","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"\(version)","checked":false,"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}
            """
        let body = """
            {"version":1,"householdId":"\(household)","groceries":[\(includeItem ? row : "")]}
            """
        return try JSONDecoder().decode(GroceryList.self, from: Data(body.utf8))
    }
}
