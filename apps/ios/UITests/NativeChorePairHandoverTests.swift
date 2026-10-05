import XCTest

@MainActor
final class NativeChorePairHandoverTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testReviewRequestAndCancel() throws {
        let fixture = try NativeChorePairFixture(action: "cancel_request")
        let app = openRequest(fixture)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Chore handovers"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Retry saved handover"].exists)
        fixture.finish(app, backs: 2)
    }

    func testSendOwnedRequestOnce() throws {
        let fixture = try NativeChorePairFixture(action: "send_request")
        let state = try requestState()
        let app = openRequest(fixture)
        let send = app.buttons["Send request"]
        fixture.reveal(send, in: app)
        XCTAssertTrue(send.isEnabled && send.isHittable)
        send.tap()
        XCTAssertTrue(app.staticTexts[state].waitForExistence(timeout: 30))
        if ProcessInfo.processInfo.environment["NEST_QA_CHORE_PAIR_REQUEST_STATE"] == "confirmed" {
            app.buttons["Done"].tap()
            XCTAssertTrue(app.buttons["Refresh handovers"].waitForExistence(timeout: 15))
        }
        fixture.finish(app, backs: 2)
    }

    func testReadRetainedRequestWithoutResending() throws {
        let fixture = try NativeChorePairFixture()
        let app = fixture.openHandovers()
        XCTAssertTrue(app.staticTexts[fixture.title].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Not confirmed. Retry the saved request when online."].exists)
        XCTAssertTrue(app.buttons["Retry saved handover"].exists)
        fixture.finish(app, backs: 2)
    }

    func testRetryOriginalRequestAndFinish() throws {
        let fixture = try NativeChorePairFixture(action: "retry")
        let app = fixture.openHandovers()
        let retry = app.buttons["Retry saved handover"]
        XCTAssertTrue(retry.waitForExistence(timeout: 15))
        fixture.reveal(retry, in: app)
        retry.tap()
        XCTAssertTrue(
            app.staticTexts["Request sent. Choose Done to see current handovers."].waitForExistence(timeout: 30))
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Refresh handovers"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Retry saved handover"].exists)
        fixture.finish(app, backs: 2)
    }

    func testReviewRecipientDecisionAndCancel() throws {
        let fixture = try NativeChorePairFixture(action: "cancel_decision")
        let app = try openDecision(fixture)
        app.buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Chore handovers"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Retry saved handover"].exists)
        fixture.finish(app, backs: 2)
    }

    func testConfirmRecipientDecisionOnce() throws {
        let fixture = try NativeChorePairFixture(action: "respond")
        let app = try openDecision(fixture)
        let decision = try decisionTitle()
        let confirm = app.buttons[decision + " handover"]
        fixture.reveal(confirm, in: app)
        XCTAssertTrue(confirm.isEnabled && confirm.isHittable)
        confirm.tap()
        XCTAssertTrue(app.staticTexts["Decision saved."].waitForExistence(timeout: 30))
        app.buttons["Done"].tap()
        XCTAssertTrue(app.buttons["Refresh handovers"].waitForExistence(timeout: 15))
        fixture.finish(app, backs: 2)
    }

    private func openRequest(_ fixture: NativeChorePairFixture) -> XCUIApplication {
        let app = fixture.openHandovers()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        fixture.reveal(row, in: app)
        XCTAssertTrue(row.isHittable)
        row.tap()
        XCTAssertTrue(app.navigationBars["Review handover"].waitForExistence(timeout: 15))
        let message = app.staticTexts.matching(
            NSPredicate(format: "label BEGINSWITH %@", "Ask your partner to take " + fixture.title)
        ).firstMatch
        XCTAssertTrue(message.exists)
        XCTAssertTrue(message.label.contains("It stays assigned to you until accepted."))
        return app
    }

    private func openDecision(_ fixture: NativeChorePairFixture) throws -> XCUIApplication {
        let decision = try decisionTitle()
        let app = fixture.openHandovers()
        let cell = app.cells.containing(.staticText, identifier: fixture.title).firstMatch
        fixture.reveal(cell, in: app)
        XCTAssertTrue(cell.exists)
        let button = cell.buttons[decision]
        XCTAssertTrue(button.isHittable)
        button.tap()
        XCTAssertTrue(app.navigationBars["Review handover"].waitForExistence(timeout: 15))
        let prefix = decision == "Accept" ? "Take responsibility for " : "Decline "
        XCTAssertTrue(
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", prefix + fixture.title)).firstMatch
                .exists)
        return app
    }

    private func decisionTitle() throws -> String {
        let decision = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_CHORE_PAIR_DECISION"])
        guard ["Accept", "Decline"].contains(decision) else { throw NativeChorePairFailure.configuration }
        return decision
    }

    private func requestState() throws -> String {
        let state = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_CHORE_PAIR_REQUEST_STATE"])
        guard ["uncertain", "confirmed"].contains(state) else { throw NativeChorePairFailure.configuration }
        return state == "uncertain"
            ? "Not confirmed. Retry the saved request when online."
            : "Request sent. Choose Done to see current handovers."
    }
}
