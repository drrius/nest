import Foundation
import XCTest

@testable import Nest

@MainActor
final class VariableCycleContentionTests: XCTestCase {
    func testSaveWinningConcurrentCancellationRetainsOneRecordedResult() async throws {
        try await verify(first: "save")
    }

    func testCancellationWinningDelayedSaveRetainsCancelledResult() async throws {
        try await verify(first: "cancel")
    }

    private func verify(first: String) async throws {
        let fixture = try NativeVariableRaceFixture()
        let setup = try await fixture.setup(first)
        let url = FileManager.default.temporaryDirectory.appending(path: "variable-contention-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = try fixture.model(setup, url: url)
        await model.restore()
        let context = try model.expenseContext()
        try await model.stageVariableCycle(setup.input, context: context)
        let staged = try await model.savedVariableCycle(context)
        let original = try XCTUnwrap(staged)
        let saving = Task { try await model.retryVariableCycle(context) }
        try await fixture.wait(first == "save" ? "saveBlocked" : "saves")
        let cancelling = Task { try await model.cancelVariableCycle(context) }
        try await fixture.wait("cancelBlocked")
        if first == "cancel" {
            _ = try await fixture.control("release-save")
            try await fixture.wait("saveBlocked")
        }
        let blocked = try await fixture.control("state")
        XCTAssertEqual(blocked["saveBlocked"] as? Bool, true)
        XCTAssertEqual(blocked["cancelBlocked"] as? Bool, true)
        _ = try await fixture.control("release")
        if first == "save" {
            let saved = try await saving.value
            XCTAssertEqual(saved.result?.status, .recorded)
        } else {
            do {
                _ = try await saving.value
                XCTFail("Delayed Save succeeded after committed cancellation")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        }
        let cancelled = try await cancelling.value
        XCTAssertEqual(cancelled.command, original.command)
        XCTAssertEqual(cancelled.result?.status, first == "save" ? .recorded : .cancelled)
        let reopened = try fixture.model(setup, url: url)
        await reopened.restore()
        let restoredContext = try reopened.expenseContext()
        let restored = try await reopened.retryVariableCycle(restoredContext)
        XCTAssertEqual(restored.command, original.command)
        XCTAssertEqual(restored.cancellationRequested, true)
        XCTAssertEqual(restored.result?.status, cancelled.result?.status)
        XCTAssertEqual(restored.result?.receipt?.eventId, cancelled.result?.receipt?.eventId)
        let outcome = try await fixture.control("outcome")
        for key in ["events", "cycles", "receipts"] {
            XCTAssertEqual(outcome[key] as? Int, first == "save" ? 1 : 0)
        }
        XCTAssertEqual(outcome["tombstones"] as? Int, first == "cancel" ? 1 : 0)
        XCTAssertEqual(outcome["ledger"] as? Int, first == "save" ? 2 : 0)
        XCTAssertEqual(outcome["ledgerSum"] as? String, "0")
        XCTAssertEqual(outcome["saves"] as? Int, 1)
        XCTAssertEqual(outcome["cancels"] as? Int, 1)
        try await reopened.finishVariableCycle(restoredContext, operation: original.command.operationId)
        let cleared = try await reopened.savedVariableCycle(restoredContext)
        XCTAssertNil(cleared)
    }
}
