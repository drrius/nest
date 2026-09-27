import Foundation
import XCTest

@testable import NestCore

final class GroceryAddStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testUncertainAddSurvivesRestartWithExactIdentityAndCannotCrossAccount() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-add-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Oat milk",
            quantity: "1", unit: "carton", categoryId: nil)
        try await store.enqueueGroceryAdd(command, lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let outsiderAdd = try await reopened.readGroceryAdd(outsiderLease)
        XCTAssertNil(outsiderAdd)
        do {
            _ = try await store.readGroceryAdd(lease)
            XCTFail("Old lease accessed another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restoredLease = try await reopened.activate(member)
        let restored = try await reopened.readGroceryAdd(restoredLease)
        XCTAssertEqual(restored?.state, .pending)
        XCTAssertEqual(restored?.command, command)
        do {
            try await reopened.enqueueGroceryAdd(
                AddGrocery(
                    operationId: UUID(), itemId: UUID(), name: "Another item",
                    quantity: nil, unit: nil, categoryId: nil), lease: restoredLease)
            XCTFail("Second add replaced the uncertain operation")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
    }

    func testConfirmedAddClearsOnlyAfterFreshSnapshotAndConflictNeedsExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-add-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let command = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Oat milk",
            quantity: nil, unit: nil, categoryId: nil)
        try await store.enqueueGroceryAdd(command, lease: lease)
        let receipt = try JSONDecoder().decode(
            GroceryWriteReceipt.self,
            from: Data(
                """
                {"operation":"\(command.operationId)","target":"\(command.itemId)","version":"43","checked":false,"removed":false}
                """.utf8))
        try await store.acknowledgeGroceryAdd(receipt, lease: lease)
        let acknowledged = try await store.readGroceryAdd(lease)
        XCTAssertEqual(acknowledged?.state, .acknowledged)
        let emptyBody = """
            {"version":1,"householdId":"\(household)","groceries":[]}
            """
        let empty = try JSONDecoder().decode(
            GroceryList.self, from: Data(emptyBody.utf8))
        try await store.saveGroceries(empty, lease: lease)
        let cleared = try await store.readGroceryAdd(lease)
        XCTAssertNil(cleared)

        let another = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Bread",
            quantity: nil, unit: nil, categoryId: nil)
        try await store.enqueueGroceryAdd(another, lease: lease)
        try await store.conflictGroceryAdd(another.operationId, reason: "changed", lease: lease)
        try await store.saveGroceries(empty, lease: lease)
        let conflicted = try await store.readGroceryAdd(lease)
        XCTAssertEqual(conflicted?.state, .conflict)
        try await store.discardConflictedGroceryAdd(another.operationId, lease: lease)
        let discarded = try await store.readGroceryAdd(lease)
        XCTAssertNil(discarded)
    }
}
