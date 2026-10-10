import XCTest

@MainActor
final class NativeChorePairCompletionTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCompleteOwnedOccurrenceOnce() throws {
        let fixture = try NativeChorePairFixture(action: "complete")
        let state = try expectedState()
        let app = fixture.openToday()
        let everyone = app.buttons["Everyone"]
        fixture.reveal(everyone, in: app)
        everyone.tap()
        let item = app.buttons[fixture.title]
        fixture.reveal(item, in: app)
        XCTAssertTrue(item.isHittable && item.isEnabled)
        XCTAssertEqual(item.value as? String, "Due today")
        item.tap()
        if state == "pending" {
            let retained = app.descendants(matching: .any).matching(identifier: fixture.title).firstMatch
            fixture.waitForValue(retained, "Saved on this iPhone · syncs when online")
        } else {
            let settled = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false"), object: app.buttons[fixture.title])
            XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
        }
        fixture.finish(app, backs: 0)
    }

    func testReadQueuedCompletionAfterRestart() throws {
        let fixture = try NativeChorePairFixture()
        let app = fixture.openToday()
        app.buttons["Everyone"].tap()
        let retained = app.descendants(matching: .any).matching(identifier: fixture.title).firstMatch
        fixture.reveal(retained, in: app)
        XCTAssertEqual(retained.value as? String, "Saved on this iPhone · syncs when online")
        XCTAssertFalse(app.buttons[fixture.title].isEnabled)
        fixture.finish(app, backs: 0)
    }

    func testReplayedCompletionLeavesNoCurrentDueButton() throws {
        let fixture = try NativeChorePairFixture()
        let app = fixture.openToday()
        app.buttons["Everyone"].tap()
        XCTAssertFalse(app.buttons[fixture.title].exists)
        XCTAssertFalse(app.staticTexts["A saved change needs your review."].exists)
        fixture.finish(app, backs: 0)
    }

    private func expectedState() throws -> String {
        let state = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_CHORE_PAIR_COMPLETION_STATE"])
        guard ["pending", "confirmed"].contains(state) else { throw NativeChorePairFailure.configuration }
        return state
    }
}
