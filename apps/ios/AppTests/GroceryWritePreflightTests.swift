import Foundation
import XCTest

@testable import Nest

@MainActor
final class GroceryWritePreflightTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-1111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-2222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-3333-333333333333")!

    private func fixture() throws -> (SessionModel, FakeGroceryServer) {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actorA, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: actorB, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actorA, actorB: actorB, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await chores.respond(request)
        }
        let groceryHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            try await server.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-preflight-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            groceryAPI: GroceryAPI(http: groceryHTTP))
        return (model, server)
    }

    private func initialItem(_ model: SessionModel) async throws -> GroceryItem {
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries else { throw NestAPIFailure.unavailable }
        return try XCTUnwrap(before.items.first?.item)
    }

    private func assertNothingStaged(_ model: SessionModel, server: FakeGroceryServer) async throws {
        XCTAssertNil(model.groceryEdit)
        XCTAssertNil(model.groceryRemove)
        let store = try XCTUnwrap(model.offline)
        let lease = try XCTUnwrap(model.lease)
        let edit = try await store.readGroceryEdit(lease)
        let removal = try await store.readGroceryRemove(lease)
        XCTAssertNil(edit)
        XCTAssertNil(removal)
        let edits = await server.editOperations()
        let removals = await server.removeOperations()
        XCTAssertTrue(edits.isEmpty)
        XCTAssertTrue(removals.isEmpty)
    }

    func testOfflineEditAndRemovalCannotCreateOnlineOnlyIntent() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.setOffline(true)
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: "2", unit: "bags", categoryId: nil)
        XCTAssertFalse(confirmed)
        await model.removeGrocery(item)
        try await assertNothingStaged(model, server: server)
    }

    func testFreshMembershipRefusalCannotStageEdit() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.denyMembership()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertFalse(confirmed)
        XCTAssertEqual(model.status, .notMember)
        XCTAssertNil(model.groceryEdit)
        let attempts = await server.editOperations()
        XCTAssertTrue(attempts.isEmpty)
    }

    func testFreshMembershipRefusalCannotStageRemoval() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.denyMembership()
        await model.removeGrocery(item)
        XCTAssertEqual(model.status, .notMember)
        XCTAssertNil(model.groceryRemove)
        let attempts = await server.removeOperations()
        XCTAssertTrue(attempts.isEmpty)
    }

    func testChangedItemCannotBeEditedOrRemovedFromCachedForm() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.changeOriginal()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertFalse(confirmed)
        await model.removeGrocery(item)
        try await assertNothingStaged(model, server: server)
        let reloaded = await model.reloadGroceryForEditing(item)
        let current = try XCTUnwrap(reloaded)
        XCTAssertEqual(current.name, "Partner apples")
        XCTAssertEqual(current.version, "43")
        guard case .loaded(let refreshed) = model.groceries else { return XCTFail("Reload did not update cache") }
        XCTAssertEqual(refreshed.snapshot.groceries.first, current)
        let saved = await model.editGrocery(current, name: "My apples", quantity: "2", unit: "bags", categoryId: nil)
        XCTAssertTrue(saved)
        XCTAssertNil(model.groceryEdit)
        let attempts = await server.editOperations()
        XCTAssertEqual(attempts.count, 1)
    }

    func testRemovedItemCannotStageAnEditOrRemovalOrBeRecreated() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.removeOriginal()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertFalse(confirmed)
        await model.removeGrocery(item)
        let current = await model.reloadGroceryForEditing(item)
        XCTAssertNil(current)
        XCTAssertNil(model.groceryAdd)
        try await assertNothingStaged(model, server: server)
    }

    func testCategoryRemovedAfterSelectionCannotBeUsedForNewEdit() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await model.refreshGroceryCategories()
        XCTAssertTrue(model.groceryCategoryAvailable(actorA))
        await server.removeCategories()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: actorA)
        XCTAssertFalse(confirmed)
        XCTAssertFalse(model.groceryCategoryAvailable(actorA))
        try await assertNothingStaged(model, server: server)
        let withoutCategory = await model.editGrocery(
            item, name: "My apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertTrue(withoutCategory)
    }

    func testUnconfirmedEditKeepsFieldsAndRetriesOnlyItsSavedOperation() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.loseNextEdit()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: "2", unit: "bags", categoryId: nil)
        XCTAssertFalse(confirmed)
        let saved = try XCTUnwrap(model.groceryEdit)
        XCTAssertEqual(saved.state, .pending)
        XCTAssertEqual(saved.command.name, "My apples")
        XCTAssertEqual(saved.command.quantity, "2")
        XCTAssertEqual(saved.command.unit, "bags")
        let replacement = await model.editGrocery(item, name: "Other apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertFalse(replacement)
        XCTAssertEqual(model.groceryEdit?.command, saved.command)
        let retryConfirmed = await model.retryGroceryEdit()
        XCTAssertTrue(retryConfirmed)
        let attempts = await server.editOperations()
        XCTAssertEqual(attempts, [saved.command.operationId, saved.command.operationId])
        XCTAssertNil(model.groceryEdit)
    }

    func testAcknowledgedEditReportsSuccessWhenFollowingReadFails() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.loseListAfterEdit()
        let confirmed = await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertTrue(confirmed)
        XCTAssertEqual(model.groceryEdit?.state, .acknowledged)
        let retryConfirmed = await model.retryGroceryEdit()
        XCTAssertTrue(retryConfirmed)
        let attempts = await server.editOperations()
        XCTAssertEqual(attempts.count, 1)
        XCTAssertNil(model.groceryEdit)
    }

    func testAccountChangeDuringPreflightCannotQueueOldEdit() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.pauseActorA()
        let old = Task { await model.editGrocery(item, name: "My apples", quantity: nil, unit: nil, categoryId: nil) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshGroceries()
        await server.releaseActorA()
        let confirmed = await old.value
        XCTAssertFalse(confirmed)
        XCTAssertNil(model.groceryEdit)
        guard case .ready(let member) = model.status else { return XCTFail("B is not ready") }
        XCTAssertEqual(member.userId, actorB)
        guard case .loaded(let current) = model.groceries else { return XCTFail("B list missing") }
        XCTAssertEqual(current.items.first?.item.name, "Sam pears")
        let attempts = await server.editOperations()
        XCTAssertTrue(attempts.isEmpty)
    }

    func testOldReloadCannotReplaceNewMemberDisplayOrCache() async throws {
        let (model, server) = try fixture()
        let item = try await initialItem(model)
        await server.pauseActorA()
        let old = Task { await model.reloadGroceryForEditing(item) }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshGroceries()
        await server.releaseActorA()
        let result = await old.value
        XCTAssertNil(result)
        guard case .loaded(let current) = model.groceries else { return XCTFail("B list missing") }
        XCTAssertEqual(current.items.first?.item.name, "Sam pears")
        try await assertNothingStaged(model, server: server)
    }
}
