import Foundation
import XCTest

@testable import Nest

@MainActor
final class GrocerySessionModelTests: XCTestCase {
    private let actorA = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let actorB = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let household = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    private func model(server: FakeGroceryServer) throws -> SessionModel {
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
        let url = FileManager.default.temporaryDirectory.appending(path: "grocery-model-\(UUID()).sqlite")
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            groceryAPI: GroceryAPI(http: groceryHTTP))
    }

    func testInFlightAccountAListCannotReplaceAccountBDisplay() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await server.pauseActorA()
        let old = Task { await model.refreshGroceries() }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries else { return XCTFail("B list did not load") }
        XCTAssertEqual(before.items.first?.item.name, "Sam pears")
        await server.releaseActorA()
        await old.value
        guard case .loaded(let after) = model.groceries else { return XCTFail("A replaced B") }
        XCTAssertEqual(after.items.first?.item.name, "Sam pears")
    }

    func testOfflineCheckIsVisiblePendingThenConfirmedOnline() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries,
            let item = before.items.first?.item
        else { return XCTFail("Initial list did not load") }
        await server.setOffline(true)
        await model.checkGrocery(item, checked: true)
        guard case .loaded(let saved) = model.groceries else { return XCTFail("Saved check disappeared") }
        XCTAssertEqual(saved.items.first?.state, .pending)
        XCTAssertEqual(saved.items.first?.checked, true)
        await server.setOffline(false)
        await model.refreshGroceries()
        guard case .loaded(let confirmed) = model.groceries else { return XCTFail("List did not recover") }
        XCTAssertEqual(confirmed.items.first?.state, .open)
        XCTAssertEqual(confirmed.items.first?.checked, true)
    }

    func testLostAddResponseRetriesExactOperationWithoutDuplicateItem() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.loseNextAdd()
        let initiallyConfirmed = await model.addGrocery(name: "Oat milk", quantity: nil, unit: nil)
        XCTAssertFalse(initiallyConfirmed)
        XCTAssertEqual(model.groceryAdd?.state, .pending)
        let first = await server.addOperations()
        XCTAssertEqual(first.count, 1)
        let retryConfirmed = await model.retryGroceryAdd()
        XCTAssertTrue(retryConfirmed)
        let attempts = await server.addOperations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.groceryAdd)
        guard case .loaded(let saved) = model.groceries else { return XCTFail("List did not refresh") }
        XCTAssertEqual(saved.items.filter { $0.item.name == "Oat milk" }.count, 1)
    }

    func testInFlightCategoriesCannotReplaceAnotherAccount() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await server.pauseActorA()
        let old = Task { await model.refreshGroceryCategories() }
        await server.waitForActorA()
        await model.signIn(idToken: "B", nonce: "test")
        await model.refreshGroceryCategories()
        guard case .loaded(let before) = model.groceryCategoryStatus else {
            return XCTFail("B categories did not load")
        }
        XCTAssertEqual(before.first?.name, "Sam pantry")
        await server.releaseActorA()
        await old.value
        guard case .loaded(let after) = model.groceryCategoryStatus else {
            return XCTFail("A categories replaced B")
        }
        XCTAssertEqual(after.first?.name, "Sam pantry")
    }

    func testOldAccountCategoryCannotBeSubmittedAfterSwitch() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceryCategories()
        await model.signIn(idToken: "B", nonce: "test")
        let denied = await model.addGrocery(
            name: "Oat milk", quantity: nil, unit: nil, categoryId: actorA)
        XCTAssertFalse(denied)
        XCTAssertNil(model.groceryAdd)
        let deniedAttempts = await server.addOperations()
        XCTAssertTrue(deniedAttempts.isEmpty)
        await model.refreshGroceryCategories()
        let confirmed = await model.addGrocery(
            name: "Oat milk", quantity: nil, unit: nil, categoryId: actorB)
        XCTAssertTrue(confirmed)
        let acceptedAttempts = await server.addOperations()
        XCTAssertEqual(acceptedAttempts.count, 1)
        let submittedCategory = await server.addedCategory()
        XCTAssertEqual(submittedCategory, actorB)
    }

    func testUnconfirmedAddKeepsItsFieldsAndRetriesOnlyTheSavedOperation() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.loseNextAdd()
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: "2", unit: "litres")
        XCTAssertFalse(confirmed)
        let saved = try XCTUnwrap(model.groceryAdd)
        XCTAssertEqual(saved.state, .pending)
        XCTAssertEqual(saved.command.name, "Oat milk")
        XCTAssertEqual(saved.command.quantity, "2")
        XCTAssertEqual(saved.command.unit, "litres")
        let replacement = await model.addGrocery(name: "Different item", quantity: nil, unit: nil)
        XCTAssertFalse(replacement)
        XCTAssertEqual(model.groceryAdd?.command, saved.command)
        let firstAttempts = await server.addOperations()
        XCTAssertEqual(firstAttempts, [saved.command.operationId])
        let retryConfirmed = await model.retryGroceryAdd()
        XCTAssertTrue(retryConfirmed)
        let attempts = await server.addOperations()
        XCTAssertEqual(attempts, [saved.command.operationId, saved.command.operationId])
        XCTAssertNil(model.groceryAdd)
    }

    func testOfflineNewAddIsNotStagedOrReportedAsConfirmed() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.setOffline(true)
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: "2", unit: "litres")
        XCTAssertFalse(confirmed)
        XCTAssertNil(model.groceryAdd)
        let store = try XCTUnwrap(model.offline)
        let lease = try XCTUnwrap(model.lease)
        let staged = try await store.readGroceryAdd(lease)
        XCTAssertNil(staged)
        let attempts = await server.addOperations()
        XCTAssertTrue(attempts.isEmpty)
    }

    func testFreshMembershipRefusalPreventsStagingNewAdd() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.denyMembership()
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: nil, unit: nil)
        XCTAssertFalse(confirmed)
        XCTAssertNil(model.groceryAdd)
        XCTAssertEqual(model.status, .notMember)
        let attempts = await server.addOperations()
        XCTAssertTrue(attempts.isEmpty)
    }

    func testCategoryRemovedAfterSelectionCannotBeStagedFromItsCachedChoice() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceryCategories()
        XCTAssertTrue(model.groceryCategoryAvailable(actorA))
        await server.removeCategories()
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: nil, unit: nil, categoryId: actorA)
        XCTAssertFalse(confirmed)
        XCTAssertFalse(model.groceryCategoryAvailable(actorA))
        XCTAssertNil(model.groceryAdd)
        let attempts = await server.addOperations()
        XCTAssertTrue(attempts.isEmpty)
        let withoutCategory = await model.addGrocery(name: "Oat milk", quantity: nil, unit: nil)
        XCTAssertTrue(withoutCategory)
    }

    func testInvalidAddCannotReportConfirmationOrStageARequest() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        let confirmed = await model.addGrocery(name: "   ", quantity: nil, unit: nil)
        XCTAssertFalse(confirmed)
        XCTAssertNil(model.groceryAdd)
        XCTAssertNotNil(model.groceryNotice)
        let attempts = await server.addOperations()
        XCTAssertTrue(attempts.isEmpty)
        let retryConfirmed = await model.retryGroceryAdd()
        XCTAssertFalse(retryConfirmed)
    }

    func testRejectedAddCannotReportConfirmationOrRetryAsANewRequest() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.rejectAdd()
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: "2", unit: "litres")
        XCTAssertFalse(confirmed)
        let saved = try XCTUnwrap(model.groceryAdd)
        XCTAssertEqual(saved.state, .conflict)
        XCTAssertEqual(saved.command.name, "Oat milk")
        let retryConfirmed = await model.retryGroceryAdd()
        XCTAssertFalse(retryConfirmed)
        let attempts = await server.addOperations()
        XCTAssertEqual(attempts, [saved.command.operationId])
        XCTAssertEqual(model.groceryAdd?.command, saved.command)
    }

    func testConfirmedAddReportsSuccessEvenWhenTheFollowingReadFails() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        await server.loseListAfterAdd()
        let confirmed = await model.addGrocery(name: "Oat milk", quantity: nil, unit: nil)
        XCTAssertTrue(confirmed)
        let saved = try XCTUnwrap(model.groceryAdd)
        XCTAssertEqual(saved.state, .acknowledged)
        let retryConfirmed = await model.retryGroceryAdd()
        XCTAssertTrue(retryConfirmed)
        let attempts = await server.addOperations()
        XCTAssertEqual(attempts, [saved.command.operationId])
        XCTAssertNil(model.groceryAdd)
    }

    func testLostEditResponseRetriesSameOperationAndShowsUpdatedItem() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries,
            let item = before.items.first?.item
        else { return XCTFail("Initial list did not load") }
        await server.loseNextEdit()
        await model.editGrocery(
            item, name: "Alex sweet apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertEqual(model.groceryEdit?.state, .pending)
        let first = await server.editOperations()
        XCTAssertEqual(first.count, 1)
        await model.retryGroceryEdit()
        let attempts = await server.editOperations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.groceryEdit)
        guard case .loaded(let current) = model.groceries else { return XCTFail("List did not refresh") }
        XCTAssertEqual(current.items.first?.item.name, "Alex sweet apples")
    }

    func testRejectedEditRemainsVisibleUntilExplicitDiscard() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries,
            let item = before.items.first?.item
        else { return XCTFail("Initial list did not load") }
        await server.rejectEdit()
        await model.editGrocery(
            item, name: "Alex sweet apples", quantity: nil, unit: nil, categoryId: nil)
        XCTAssertEqual(model.groceryEdit?.state, .conflict)
        guard case .loaded(let saved) = model.groceries else { return XCTFail("List disappeared") }
        XCTAssertEqual(saved.items.first?.item.name, "Alex apples")
        await model.discardConflictedGroceryEdit()
        XCTAssertNil(model.groceryEdit)
    }

    func testLostRemoveResponseRetriesSameOperationAndOmitsItem() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries,
            let item = before.items.first?.item
        else { return XCTFail("Initial list did not load") }
        await server.loseNextRemove()
        await model.removeGrocery(item)
        XCTAssertEqual(model.groceryRemove?.state, .pending)
        let first = await server.removeOperations()
        XCTAssertEqual(first.count, 1)
        await model.retryGroceryRemove()
        let attempts = await server.removeOperations()
        XCTAssertEqual(attempts, [first[0], first[0]])
        XCTAssertNil(model.groceryRemove)
        guard case .loaded(let current) = model.groceries else { return XCTFail("List did not refresh") }
        XCTAssertFalse(current.items.contains { $0.id == item.id })
    }

    func testRejectedRemoveRemainsVisibleUntilExplicitDiscard() async throws {
        let server = FakeGroceryServer(actorA: actorA, actorB: actorB, household: household)
        let model = try model(server: server)
        await model.restore()
        await model.refreshGroceries()
        guard case .loaded(let before) = model.groceries,
            let item = before.items.first?.item
        else { return XCTFail("Initial list did not load") }
        await server.rejectRemove()
        await model.removeGrocery(item)
        XCTAssertEqual(model.groceryRemove?.state, .conflict)
        guard case .loaded(let saved) = model.groceries else { return XCTFail("List disappeared") }
        XCTAssertTrue(saved.items.contains { $0.id == item.id })
        await model.discardConflictedGroceryRemove()
        XCTAssertNil(model.groceryRemove)
    }
}
