import Foundation
import XCTest

@testable import NestCore

final class MealPreparationStoreTests: XCTestCase {
    func testRestartRetainsExactNullEditAndRejectsPrematureDiscardAndWrongReceipt() async throws {
        let fixture = try MealPreparationFixture()
        let original: MealPreparationEnvelope = try fixture.decode("read")
        let command: EditMealPreparation = try fixture.decode("edit")
        let url = FileManager.default.temporaryDirectory.appending(path: "prep-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(fixture.member)
        try await store.enqueueMealPreparation(.edit(command), baseline: original, lease: lease)
        do {
            try await store.discardMealPreparationConflict(lease: lease)
            XCTFail("Discarded uncertain write")
        } catch {}
        let reopened = try ChoreOfflineStore(url: url)
        let restored = try await reopened.activate(fixture.member)
        let pending = try await reopened.readMealPreparation(lease: restored)
        XCTAssertEqual(pending?.command, .edit(command))
        do {
            _ = try await store.readMealPreparation(lease: lease)
            XCTFail("Old lease read")
        } catch {}
        let wrong: MealPreparationReceipt = try fixture.decode("createReceipt")
        do {
            try await reopened.acknowledgeMealPreparation(wrong, lease: restored)
            XCTFail("Wrong receipt")
        } catch {}
        let receipt: MealPreparationReceipt = try fixture.decode("editReceipt")
        try await reopened.acknowledgeMealPreparation(receipt, lease: restored)
        try await reopened.reconcileMealPreparation(original, lease: restored)
        let retained = try await reopened.readMealPreparation(lease: restored)
        XCTAssertEqual(retained?.state, .acknowledged)
        try await reopened.reconcileMealPreparation(try fixture.read(revision: "9007199254740994"), lease: restored)
        let finished = try await reopened.readMealPreparation(lease: restored)
        XCTAssertNil(finished)
    }

    func testSameVersionNeedsExactContentAndBothOccurrenceIdentities() throws {
        let fixture = try MealPreparationFixture()
        let baseline: MealPreparationEnvelope = try fixture.decode("read")
        let command: EditMealPreparation = try fixture.decode("edit")
        let receipt: MealPreparationReceipt = try fixture.decode("editReceipt")
        let saved = SavedMealPreparation(
            baseline: baseline, command: .edit(command), state: .acknowledged, receipt: receipt)
        var object = fixture.object["read"] as! [String: Any]
        var prep = object["preparation"] as! [String: Any]
        prep["routineVersion"] = receipt.routineVersion
        object["preparation"] = prep
        XCTAssertFalse(saved.reconciles(try decodeRead(object)))
        prep["instructions"] = NSNull()
        object["preparation"] = prep
        XCTAssertTrue(saved.reconciles(try decodeRead(object)))
        prep["occurrenceId"] = UUID().uuidString
        object["preparation"] = prep
        XCTAssertFalse(saved.reconciles(try decodeRead(object)))
    }

    func testScopeIsolationAndExplicitTerminalDiscard() async throws {
        let fixture = try MealPreparationFixture()
        let baseline: MealPreparationEnvelope = try fixture.decode("read")
        let command: EditMealPreparation = try fixture.decode("edit")
        let url = FileManager.default.temporaryDirectory.appending(path: "prep-scope-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(fixture.member)
        try await store.enqueueMealPreparation(.edit(command), baseline: baseline, lease: lease)
        let other = VerifiedMember(userId: UUID(), householdId: fixture.member.householdId, displayName: "Partner")
        let otherLease = try await store.activate(other)
        let foreign = try await store.readMealPreparation(lease: otherLease)
        XCTAssertNil(foreign)
        do {
            try await store.conflictMealPreparation(command.operationId, lease: lease)
            XCTFail("Late account write")
        } catch {}
        let restored = try await store.activate(fixture.member)
        try await store.conflictMealPreparation(command.operationId, lease: restored)
        do {
            try await store.acknowledgeMealPreparation(try fixture.decode("editReceipt"), lease: restored)
            XCTFail("Replaced terminal state")
        } catch {}
        try await store.discardMealPreparationConflict(lease: restored)
        let done = try await store.readMealPreparation(lease: restored)
        XCTAssertNil(done)
    }

    private func decodeRead(_ value: [String: Any]) throws -> MealPreparationEnvelope {
        try JSONDecoder().decode(MealPreparationEnvelope.self, from: JSONSerialization.data(withJSONObject: value))
    }
}
