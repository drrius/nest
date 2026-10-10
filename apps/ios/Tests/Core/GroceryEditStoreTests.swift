import Foundation
import XCTest

@testable import NestCore

final class GroceryEditStoreTests: XCTestCase {
    private let actor = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let target = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!
    private let epoch = UUID(uuidString: "44444444-4444-4444-8444-444444444444")!

    private var member: VerifiedMember {
        VerifiedMember(userId: actor, householdId: household, displayName: "Alex")
    }

    func testUncertainEditKeepsExactVersionAcrossRestartAndAccountSwitch() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", name: "Oat milk")
        try await store.saveGroceries(list, lease: lease)
        let item = list.groceries[0]
        let command = try EditGrocery(
            item: item, operationId: UUID(), name: "Almond milk",
            quantity: "1", unit: "carton", categoryId: nil)
        try await store.enqueueGroceryEdit(item, command: command, lease: lease)

        let reopened = try ChoreOfflineStore(url: url)
        let outsider = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Sam")
        let outsiderLease = try await reopened.activate(outsider)
        let foreign = try await reopened.readGroceryEdit(outsiderLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readGroceryEdit(lease)
            XCTFail("Old lease accessed another account")
        } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        let restored = try await reopened.activate(member)
        let saved = try await reopened.readGroceryEdit(restored)
        XCTAssertEqual(saved?.state, .pending)
        XCTAssertEqual(saved?.command, command)
        XCTAssertEqual(saved?.command.expectedVersion, "42")
    }

    func testRejectedEditSurvivesRefreshUntilExplicitDiscard() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", name: "Oat milk")
        try await store.saveGroceries(list, lease: lease)
        let item = list.groceries[0]
        let command = try EditGrocery(
            item: item, operationId: UUID(), name: "Almond milk",
            quantity: nil, unit: nil, categoryId: nil)
        try await store.enqueueGroceryEdit(item, command: command, lease: lease)
        try await store.conflictGroceryEdit(command.operationId, reason: "changed", lease: lease)
        try await store.saveGroceries(try snapshot(version: "43", name: "Other edit"), lease: lease)
        let conflict = try await store.readGroceryEdit(lease)
        XCTAssertEqual(conflict?.state, .conflict)
        XCTAssertEqual(conflict?.command, command)
        try await store.discardConflictedGroceryEdit(command.operationId, lease: lease)
        let discarded = try await store.readGroceryEdit(lease)
        XCTAssertNil(discarded)
    }

    func testConfirmedEditClearsOnlyAfterFreshList() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-edit-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let list = try snapshot(version: "42", name: "Oat milk")
        try await store.saveGroceries(list, lease: lease)
        let item = list.groceries[0]
        let command = try EditGrocery(
            item: item, operationId: UUID(), name: "Almond milk",
            quantity: nil, unit: nil, categoryId: nil)
        try await store.enqueueGroceryEdit(item, command: command, lease: lease)
        let body = """
            {"operation":"\(command.operationId)","target":"\(target)","version":"43","checked":false,"removed":false}
            """
        let receipt = try JSONDecoder().decode(GroceryWriteReceipt.self, from: Data(body.utf8))
        try await store.acknowledgeGroceryEdit(receipt, lease: lease)
        let acknowledged = try await store.readGroceryEdit(lease)
        XCTAssertEqual(acknowledged?.state, .acknowledged)
        try await store.saveGroceries(list, lease: lease)
        let stillAcknowledged = try await store.readGroceryEdit(lease)
        XCTAssertEqual(stillAcknowledged?.state, .acknowledged)
        try await store.saveGroceries(try snapshot(version: "43", name: "Almond milk"), lease: lease)
        let cleared = try await store.readGroceryEdit(lease)
        XCTAssertNil(cleared)
    }

    private func snapshot(version: String, name: String) throws -> GroceryList {
        let body = """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(target)","name":"\(name)","quantity":null,"unit":null,"categoryId":null,"categoryName":null,"version":"\(version)","checked":false,"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}]}
            """
        return try JSONDecoder().decode(GroceryList.self, from: Data(body.utf8))
    }
}
